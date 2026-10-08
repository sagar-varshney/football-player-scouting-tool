// Read-only checks. Never silently merge identities or rewrite imported statistics.
export function inspectDataset(players, features) {
  const issues = [], counts = { error: 0, warning: 0 };
  const add = (severity, code, message, rows) => { counts[severity]++; if (issues.length < 200) issues.push({ severity, code, message, rows }); };
  const exact = new Map(), display = new Map(), ids = new Map();
  const normalize = value => String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const limits = { goals_p90: 3, xg_p90: 3, assists_p90: 3, xa_p90: 3, shots_p90: 12, key_passes_p90: 12, xg_chain_p90: 8, xg_buildup_p90: 5 };
  players.forEach((p, i) => {
    for (const field of ["player_name", "club", "position", "season"]) if (typeof p[field] !== "string" || !p[field].trim()) add("error", "identity", `Missing ${field}.`, [i]);
    if (!Number.isSafeInteger(p.player_id)) add("error", "id", "Player ID must be a safe integer.", [i]);
    const key = JSON.stringify([p.player_id, p.season, p.club, p.position]);
    if (exact.has(key)) add("error", "duplicate", "Duplicate player-season/club/position record.", [exact.get(key), i]); else exact.set(key, i);
    const nameKey = JSON.stringify([p.player_name, p.club, p.position, p.season]);
    if (display.has(nameKey) && players[display.get(nameKey)].player_id !== p.player_id) add("error", "display-collision", "Different IDs have the same interface identity; disambiguate before import.", [display.get(nameKey), i]); else display.set(nameKey, i);
    if (!ids.has(p.player_id)) ids.set(p.player_id, []);
    ids.get(p.player_id).push(i);
    if (!Number.isFinite(p.minutes) || p.minutes < 0) add("error", "minutes", "Missing or invalid minutes.", [i]);
    if (Number.isFinite(p.matches) && p.minutes > p.matches * 90 + 1) add("warning", "minutes-matches", "Minutes exceed recorded matches × 90; check source conventions or totals.", [i]);
    for (const f of features) {
      if (typeof p[f] !== "number" || !Number.isFinite(p[f]) || p[f] < 0) add("error", "metric", `Missing, negative or non-finite ${f}.`, [i]);
      else if (p[f] > (limits[f] ?? Infinity)) add("warning", "extreme-rate", `${f} exceeds a screening threshold; this is a warning, not proof of error.`, [i]);
    }
    if (Number.isFinite(p.goals) && Number.isFinite(p.shots) && p.goals > p.shots) add("warning", "totals", "Goals exceed shots; check definitions and record alignment.", [i]);
  });
  for (const rows of ids.values()) {
    if (new Set(rows.map(i => String(players[i].player_name))).size > 1) add("warning", "name-variants", "One ID has different player names; review aliases rather than automatically merging.", rows);
    const bySeason = new Map();
    rows.forEach(i => { const s = players[i].season; if (!bySeason.has(s)) bySeason.set(s, []); bySeason.get(s).push(i); });
    for (const group of bySeason.values()) if (new Set(group.map(i => normalize(players[i].club))).size > 1) add("warning", "transfer", "Multiple clubs in one season: retain transfer spells; do not sum per-90 values or treat them as independent players.", group);
  }
  return { profiles: players.length, errors: counts.error, warnings: counts.warning, issues, truncated: counts.error + counts.warning > issues.length };
}
