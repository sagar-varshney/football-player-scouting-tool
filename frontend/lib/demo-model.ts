// Fits only the generated fictional metrics. No provider inputs or paid services.
export type MetricProfile = { position: string; [key: string]: string | number };

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const distance = (a: number[], b: number[]) => a.reduce((sum, v, j) => sum + (v - b[j]) ** 2, 0);

export function fitDemoKMeans(players: MetricProfile[], features: string[], seed = 42, k = 5, restarts = 10) {
  if (!players.length || !features.length || !Number.isInteger(k) || k < 1 || k > players.length || !Number.isInteger(restarts) || restarts < 1) throw new Error("Invalid clustering configuration");
  const raw = players.map(p => features.map(f => {
    const value = p[f];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Missing or invalid clustering metric: ${f}`);
    return value;
  }));
  // Population variance, matching StandardScaler's default convention.
  const mean = features.map((_, j) => raw.reduce((s, row) => s + row[j], 0) / raw.length);
  const scale = mean.map((m, j) => Math.sqrt(raw.reduce((s, row) => s + (row[j] - m) ** 2, 0) / raw.length) || 1);
  const points = raw.map(row => row.map((v, j) => (v - mean[j]) / scale[j]));
  if (new Set(points.map(p => JSON.stringify(p))).size < k) throw new Error("Not enough distinct profiles for clustering");
  const rng = seededRandom(seed);
  let best: { assignments: number[]; centers: number[][]; inertia: number; iterations: number } | undefined;
  for (let run = 0; run < restarts; run++) {
    let centers = [points[Math.floor(rng() * points.length)].slice()];
    // Seeded k-means++ distance-weighted initialization.
    while (centers.length < k) {
      const weights = points.map(point => Math.min(...centers.map(c => distance(point, c))));
      let threshold = rng() * weights.reduce((s, v) => s + v, 0);
      let chosen = weights.findLastIndex(v => v > 0);
      for (let i = 0; i < weights.length; i++) { threshold -= weights[i]; if (weights[i] > 0 && threshold < 0) { chosen = i; break; } }
      centers.push(points[chosen].slice());
    }
    let assignments = points.map(() => -1);
    let iterations = 0;
    for (; iterations < 300; iterations++) {
      const next = points.map(point => {
        let closest = 0;
        for (let c = 1; c < k; c++) if (distance(point, centers[c]) < distance(point, centers[closest])) closest = c;
        return closest;
      });
      const counts = Array(k).fill(0) as number[];
      next.forEach(c => counts[c]++);
      // Relocate empty clusters using a far-away point from a non-singleton group.
      for (let c = 0; c < k; c++) if (!counts[c]) {
        let chosen = -1, farthest = -1;
        points.forEach((point, i) => { const d = distance(point, centers[next[i]]); if (counts[next[i]] > 1 && d > farthest) { chosen = i; farthest = d; } });
        counts[next[chosen]]--; next[chosen] = c; counts[c]++;
      }
      const updated = Array.from({ length: k }, () => features.map(() => 0));
      points.forEach((point, i) => point.forEach((value, j) => { updated[next[i]][j] += value / counts[next[i]]; }));
      const unchanged = next.every((c, i) => c === assignments[i]);
      assignments = next; centers = updated;
      if (unchanged) { iterations++; break; }
    }
    const inertia = points.reduce((sum, point, i) => sum + distance(point, centers[assignments[i]]), 0);
    if (!best || inertia < best.inertia) best = { assignments, centers, inertia, iterations };
  }
  return { ...best!, mean, scale, seed, restarts, k };
}

// Same position-relative average ranks and ordered thresholds as the local exporter.
// These label rules are separate from both K-means and sample-adjusted UI ranks.
export function styleLabel(position: string, p: Record<string, number>) {
  const finishing = (p.goals_p90 + p.xg_p90 + p.shots_p90) / 3;
  const scoring = (p.goals_p90 + p.xg_p90) / 2;
  const creation = (p.assists_p90 + p.xa_p90 + p.key_passes_p90) / 3;
  const involvement = p.xg_chain_p90, buildup = p.xg_buildup_p90, shots = p.shots_p90;
  if (position === "Forward") {
    if (finishing >= 72 && creation >= 66) return "Complete Forward";
    if (scoring >= 74 && creation < 58) return "Penalty Box Finisher";
    if (creation >= 68 && involvement >= 58) return "Link Forward";
    if (buildup >= 68 || involvement >= 72) return "Connecting Forward";
    if (shots >= 68) return "Shot-Focused Forward";
    return "Balanced Forward";
  }
  if (position === "Winger") {
    if (creation >= 70 && finishing >= 68) return "Goal-Creating Winger";
    if (scoring >= 72 && shots >= 66) return "Inside Forward";
    if (creation >= 74 && buildup >= 62) return "Wide Playmaker";
    if (creation >= 68) return "Chance-Creating Winger";
    if (involvement >= 72) return "Combination Winger";
    return "Wide Outlet";
  }
  if (position === "Midfielder") {
    if (finishing >= 68 && creation >= 64) return "Goal-Creating Midfielder";
    if (creation >= 76) return "Advanced Playmaker";
    if (buildup >= 75 && involvement >= 68) return "Possession Controller";
    if (buildup >= 68) return "Buildup Connector";
    if (involvement >= 72) return "Possession Hub";
    return "Support Midfielder";
  }
  if (position === "Defender") {
    if (creation >= 68 && buildup >= 58) return "Attacking Defender";
    if (buildup >= 74 && involvement >= 62) return "Possession Defender";
    if (buildup >= 66 || involvement >= 68) return "Buildup Defender";
    return "Low-Usage Defender";
  }
  return "Unclassified Role";
}

export function deriveDemoStyles(players: MetricProfile[], features: string[]) {
  const ranks = players.map(() => ({} as Record<string, number>));
  for (const position of new Set(players.map(p => p.position))) {
    const indices = players.flatMap((p, i) => p.position === position ? [i] : []);
    for (const feature of features) {
      const sorted = indices.map(i => Number(players[i][feature])).sort((a, b) => a - b);
      indices.forEach(i => {
        const value = Number(players[i][feature]);
        ranks[i][feature] = ((sorted.indexOf(value) + sorted.lastIndexOf(value)) / 2 + 1) / sorted.length * 100;
      });
    }
  }
  return players.map((player, i) => styleLabel(player.position, ranks[i]));
}
