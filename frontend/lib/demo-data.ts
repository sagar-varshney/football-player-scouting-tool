// Original synthetic fixture. No provider records or real player identities.
export const features = ["goals_p90", "xg_p90", "assists_p90", "xa_p90", "shots_p90", "key_passes_p90", "xg_chain_p90", "xg_buildup_p90"];
const positions = ["Forward", "Winger", "Midfielder", "Defender"];
const roles = ["Balanced Forward", "Combination Winger", "Possession Controller", "Buildup Defender"];
const seasons = ["Demo 01", "Demo 02"];
const players = seasons.flatMap((season, s) => positions.flatMap((position, p) => Array.from({ length: 16 }, (_, i) => {
  const player: Record<string, string | number> = {
    player_id: p * 100 + i + 1, player_name: `Demo ${position} ${String(i + 1).padStart(2, "0")}`,
    club: `Example Club ${i % 8 + 1}`, position, season, minutes: 500 + ((i * 179 + p * 113 + s * 241) % 2400),
    matches: 20 + i % 12, cluster: (i + p) % 5, archetype: roles[p], source_provider: "synthetic",
  };
  const scale = [[0.9, 0.85, 0.35, 0.4, 4.5, 2, 1.2, 0.6], [0.6, 0.6, 0.5, 0.55, 3.5, 3.5, 1.2, 0.8], [0.3, 0.35, 0.4, 0.5, 2, 3, 1, 1.1], [0.15, 0.2, 0.2, 0.25, 1, 1.5, 0.7, 0.9]][p];
  features.forEach((feature, f) => { player[feature] = Number((scale[f] * (0.15 + ((i * 17 + f * 11 + p * 7 + s * 3) % 31) / 36)).toFixed(3)); });
  return player;
})));
export const demoData = {
  metadata: {
    row_count: players.length, positions, clubs: [...new Set(players.map(p => String(p.club)))], seasons, features,
    source_provider: "synthetic", data_mode: "demo", dataset_version: "synthetic-v1", model_version: "demo-style-groups",
    minimum_minutes: 450, reliability_prior_minutes: 900,
    data_note: "Fictional players and statistics for exploring the app. These are not Premier League observations or validated model results.",
  }, players,
  cluster_profiles: Array.from({ length: 5 }, (_, cluster) => ({ archetype: `Demo group ${cluster + 1}` })),
};
