// Independently authored simulation: no provider inputs, real-player mappings or fitted distributions.
import { deriveDemoStyles, fitDemoKMeans } from "./demo-model.ts";
export const features = ["goals_p90", "xg_p90", "assists_p90", "xa_p90", "shots_p90", "key_passes_p90", "xg_chain_p90", "xg_buildup_p90"];
const positions = ["Forward", "Winger", "Midfielder", "Defender"];
const seasons = ["Demo 01", "Demo 02"];
const scenarios = ["Balanced reference", "Shot-focused profile", "Increasing attacking involvement", "Decreasing attacking involvement", "Balanced alternative", "Small-sample scoring streak", "Early sample", "Established creator", "High-volume shooter", "High-quality chances", "Buildup involvement", "Low attacking output", "Finishing above expectation", "Zero recorded goals", "Supporting creator", "Buildup alternative"];
const round = (value: number) => Number(value.toFixed(4));

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function successes(trials: number, probability: number, rng: () => number) {
  let count = 0;
  for (let trial = 0; trial < trials; trial++) if (rng() < probability) count++;
  return count;
}

export function createDemoData(seed = 20261007) {
  const players = seasons.flatMap((season, s) => positions.flatMap((position, p) => Array.from({ length: 160 }, (_, i) => {
    const base = random(seed + p * 1009 + i * 9176);
    const rng = random(seed + 50021 + s * 100003 + p * 1009 + i * 9176);
    const scenario = i % scenarios.length;
    const role = scenario % 5;
    let scoring = 0.55 + base() * 0.65;
    let creation = 0.55 + base() * 0.65;
    let buildup = 0.55 + base() * 0.65;
    if (role === 1) { scoring *= 1.55; creation *= 0.65; }
    if (role === 2) { creation *= 1.6; scoring *= 0.7; }
    if (role === 3) { buildup *= 1.7; scoring *= 0.6; }
    if (scenario === 0) { scoring = 1; creation = 1.2; buildup = 1.1; }
    if (scenario === 7) creation = 1.7;
    if (scenario === 8) scoring = 1.8;
    if (scenario === 10) buildup = 1.9;
    if (scenario === 11) { scoring = 0.25; creation = 0.3; buildup = 0.45; }
    const seasonFactor = scenario === 2 ? (s === 0 ? 0.8 : 1.4) : scenario === 3 ? (s === 0 ? 1.3 : 0.7) : 0.94 + rng() * 0.12;
    let minutes = 900 + Math.floor(base() * 2100);
    if (scenario === 0) minutes = 2280 + s * 120;
    if (scenario === 5) minutes = s === 0 ? 360 : 180;
    if (scenario === 6) minutes = s === 0 ? 480 : 620;
    const nineties = minutes / 90;
    const shots = Math.max(1, Math.round([2.6, 1.9, 1.05, 0.35][p] * scoring * seasonFactor * nineties));
    const keyPasses = Math.max(0, Math.round([0.95, 1.55, 1.65, 0.65][p] * creation * seasonFactor * nineties));
    const shotQuality = scenario === 9 ? 0.21 : 0.075 + base() * 0.075;
    const chanceQuality = 0.055 + base() * 0.075;
    const xg = round(shots * shotQuality);
    const xa = round(keyPasses * chanceQuality);
    let goals = successes(shots, shotQuality, rng);
    const assists = successes(keyPasses, chanceQuality * 0.9, rng);
    if (scenario === 5) goals = Math.min(shots, s === 1 ? 3 : 2);
    if (scenario === 12) goals = Math.min(shots, Math.ceil(xg * 1.45));
    if (scenario === 13) goals = 0;
    const build = [0.14, 0.2, 0.38, 0.3][p] * buildup * seasonFactor * nineties;
    const chain = xg + xa + build + (0.05 + 0.04 * base()) * nineties;
    // Independent stream: adding context must not change the generated football metrics.
    const context = random(seed + 900001 + p * 1009 + i * 9176);
    const age = 18 + Math.floor(context() * 17) + s;
    const nationality = ["England", "Scotland", "Wales", "France", "Spain", "Germany", "Portugal", "Brazil", "Japan", "Nigeria"][Math.floor(context() * 10)];
    const foot = ["Right", "Left", "Both"][Math.floor(context() * 3)];
    const statusIndex = (i + s + p) % 10;
    const status = statusIndex < 6 ? ["Available", "a"] : statusIndex === 6 ? ["Doubtful", "d"] : statusIndex === 7 ? ["Injured", "i"] : statusIndex === 8 ? ["Suspended", "s"] : ["Unavailable", "u"];
    const player: Record<string, string | number> = {
      // Preserve existing 01–16 identities; use a disjoint ID range for the expanded pool.
      player_id: i < 16 ? p * 100 + i + 1 : 10000 + p * 1000 + i + 1,
      player_name: `Demo ${position} ${String(i + 1).padStart(2, "0")}`,
      club: `Example Club ${(i < 16 ? i % 8 : i % 32) + 1}`, position, season, minutes,
      matches: Math.min(38, Math.ceil(minutes / 75)), cluster: -1, archetype: "Pending analysis",
      source_provider: "synthetic", demo_scenario: scenarios[scenario],
      age, current_age: age, nationality, preferred_foot: foot,
      primary_position: position, secondary_position: ["Winger", "Forward", "Defender", "Midfielder"][p],
      current_club: `Example Club ${(i < 16 ? i % 8 : i % 32) + 1}`,
      current_status: status[0], current_status_code: status[1],
      current_news: `Fictional ${season} availability scenario—not a real injury or squad update.`,
      context_source: "synthetic", context_verified: "false",
      shots, key_passes: keyPasses, goals, assists, xg, xa,
    };
    [goals, xg, assists, xa, shots, keyPasses, chain, build].forEach((total, f) => {
      player[features[f]] = round(total / nineties);
    });
    return player;
  })));
  const shirts = new Map<string, number>();
  players.forEach(player => {
    const key = `${player.season}:${player.club}`;
    const shirt = (shirts.get(key) ?? 0) + 1;
    shirts.set(key, shirt); player.shirt_number = shirt;
  });
  const fitted = fitDemoKMeans(players as Array<{ position: string } & Record<string, string | number>>, features);
  const styles = deriveDemoStyles(players as Array<{ position: string } & Record<string, string | number>>, features);
  players.forEach((player, i) => { player.cluster = fitted.assignments[i]; player.archetype = styles[i]; });
  return {
    metadata: {
      row_count: players.length, positions, clubs: [...new Set(players.map(p => String(p.club)))], seasons, features,
      source_provider: "synthetic", data_mode: "demo", dataset_version: "synthetic-v4", model_version: "synthetic-kmeans-rules-v1",
      generator_seed: seed, minimum_minutes: 0, reliability_prior_minutes: 900,
      feature_units: Object.fromEntries(features.map(f => [f, "per90"])), minutes_unit: "minutes",
      clustering: { method: "standardized-kmeans++-lloyd", clusters: fitted.k, seed: fitted.seed, restarts: fitted.restarts, iterations: fitted.iterations, inertia: round(fitted.inertia), fit_scope: "all fictional player-season profiles", standardization: "population z-score", implementation: "TypeScript; not bit-identical to scikit-learn", labels: "local-exporter position-relative rank rules; separate from clusters" },
      data_note: "Independently generated fictional metrics and context. K-means fits only this simulation; style labels use metric-based rules. No provider records, live data or validated real-football predictions.",
    }, players,
    cluster_profiles: Array.from({ length: 5 }, (_, cluster) => {
      const group = players.filter(player => player.cluster === cluster);
      return Object.fromEntries([
        ["archetype", `Fictional K-means cluster ${cluster + 1}`],
        ...features.map(feature => [feature, round(group.reduce((sum, player) => sum + Number(player[feature]), 0) / group.length)]),
      ]);
    }),
  };
}

export const demoData = createDemoData();
