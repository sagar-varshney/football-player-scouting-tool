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
export function styleRules(position: string, p: Record<string, number>) {
  const finishing = (p.goals_p90 + p.xg_p90 + p.shots_p90) / 3;
  const scoring = (p.goals_p90 + p.xg_p90) / 2;
  const creation = (p.assists_p90 + p.xa_p90 + p.key_passes_p90) / 3;
  const involvement = p.xg_chain_p90, buildup = p.xg_buildup_p90, shots = p.shots_p90;
  const min = (name: string, value: number, threshold: number) => ({ name, value, threshold, operator: ">=", met: value >= threshold, gap: Math.max(0, threshold - value) });
  const max = (name: string, value: number, threshold: number) => ({ name, value, threshold, operator: "<", met: value < threshold, gap: value < threshold ? 0 : value - threshold + .001 });
  const rule = (label: string, checks: ReturnType<typeof min>[], any = false) => ({ label, checks, any, met: checks.length === 0 || (any ? checks.some(c => c.met) : checks.every(c => c.met)), gap: checks.length ? (any ? Math.min(...checks.map(c => c.gap)) : Math.max(...checks.map(c => c.gap))) : 0 });
  if (position === "Forward") return [
    rule("Complete Forward", [min("Finishing", finishing, 72), min("Creation", creation, 66)]),
    rule("Penalty Box Finisher", [min("Scoring", scoring, 74), max("Creation", creation, 58)]),
    rule("Link Forward", [min("Creation", creation, 68), min("Move involvement", involvement, 58)]),
    rule("Connecting Forward", [min("Buildup", buildup, 68), min("Move involvement", involvement, 72)], true),
    rule("Shot-Focused Forward", [min("Shots", shots, 68)]),
    rule("Balanced Forward", []),
  ];
  if (position === "Winger") return [
    rule("Goal-Creating Winger", [min("Creation", creation, 70), min("Finishing", finishing, 68)]),
    rule("Inside Forward", [min("Scoring", scoring, 72), min("Shots", shots, 66)]),
    rule("Wide Playmaker", [min("Creation", creation, 74), min("Buildup", buildup, 62)]),
    rule("Chance-Creating Winger", [min("Creation", creation, 68)]),
    rule("Combination Winger", [min("Move involvement", involvement, 72)]),
    rule("Wide Outlet", []),
  ];
  if (position === "Midfielder") return [
    rule("Goal-Creating Midfielder", [min("Finishing", finishing, 68), min("Creation", creation, 64)]),
    rule("Advanced Playmaker", [min("Creation", creation, 76)]),
    rule("Possession Controller", [min("Buildup", buildup, 75), min("Move involvement", involvement, 68)]),
    rule("Buildup Connector", [min("Buildup", buildup, 68)]),
    rule("Possession Hub", [min("Move involvement", involvement, 72)]),
    rule("Support Midfielder", []),
  ];
  if (position === "Defender") return [
    rule("Attacking Defender", [min("Creation", creation, 68), min("Buildup", buildup, 58)]),
    rule("Possession Defender", [min("Buildup", buildup, 74), min("Move involvement", involvement, 62)]),
    rule("Buildup Defender", [min("Buildup", buildup, 66), min("Move involvement", involvement, 68)], true),
    rule("Low-Usage Defender", []),
  ];
  return [rule("Unclassified Role", [])];
}

export function styleLabel(position: string, p: Record<string, number>) {
  return styleRules(position, p).find(rule => rule.met)!.label;
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
