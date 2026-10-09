import { inspectDataset } from "./data-quality.mjs";

export const supportedFeatures = ["goals_p90", "xg_p90", "assists_p90", "xa_p90", "shots_p90", "key_passes_p90", "xg_chain_p90", "xg_buildup_p90"];
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v, maximum = 200) => typeof v === "string" && !!v.trim() && v.length <= maximum;
const validDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString().slice(0, 10) === v.slice(0, 10);

// One read-only contract for CLI imports, browser previews and server-side ingestion.
export function inspectImport(data) {
  const issues = []; let errors = 0, warnings = 0;
  const add = (severity, code, message, path) => { severity === "error" ? errors++ : warnings++; if (issues.length < 200) issues.push({ severity, code, message, path }); };
  if (!object(data)) { add("error", "schema", "Dataset must be a JSON object.", "$" ); return { profiles: 0, errors, warnings, issues, truncated: false }; }
  const metadata = object(data.metadata) ? data.metadata : {};
  if (!object(data.metadata)) add("error", "schema", "metadata must be an object.", "metadata");
  const features = Array.isArray(metadata.features) ? metadata.features : [];
  if (!features.length || features.some(f => !supportedFeatures.includes(f)) || new Set(features).size !== features.length) add("error", "features", "Provide unique supported per-90 features.", "metadata.features");
  if (!Array.isArray(data.players) || data.players.length < 2 || data.players.length > 50000) add("error", "profiles", "Provide between 2 and 50,000 profiles.", "players");
  for (const f of ["dataset_version", "source_provider", "player_id_namespace", "model_version", "context_version", "context_provider"]) if (metadata[f] !== undefined && !text(metadata[f])) add("error", "metadata-type", `${f} must be a nonempty string of at most 200 characters.`, `metadata.${f}`);
  for (const f of ["generated_at", "current_context_as_of"]) if (metadata[f] !== undefined && !validDate(metadata[f])) add("error", "metadata-date", `${f} must be a valid ISO date.`, `metadata.${f}`);
  for (const f of ["minimum_minutes", "reliability_prior_minutes"]) if (metadata[f] !== undefined && (typeof metadata[f] !== "number" || !Number.isFinite(metadata[f]) || metadata[f] < 0 || metadata[f] > 10000)) add("error", "metadata-number", `${f} must be a finite number between 0 and 10,000.`, `metadata.${f}`);
  if (metadata.reliability_prior_minutes !== undefined && metadata.reliability_prior_minutes !== 900) add("warning", "prior", "The interface uses a 900-minute ranking prior, irrespective of supplied prior metadata.", "metadata.reliability_prior_minutes");
  if (metadata.feature_units === undefined) add("warning", "units-undeclared", "Legacy file: selected _p90 fields are assumed per 90 minutes, not verified. Declare feature_units to remove this ambiguity.", "metadata.feature_units");
  else if (!object(metadata.feature_units)) add("error", "units", "feature_units must map each selected feature to 'per90'.", "metadata.feature_units");
  else {
    for (const f of features) if (metadata.feature_units[f] !== "per90") add("error", "units", `${f} must explicitly use 'per90'; totals, per-match values and percentages are not interchangeable.`, `metadata.feature_units.${f}`);
    for (const f of Object.keys(metadata.feature_units)) if (!supportedFeatures.includes(f)) add("error", "units", "Unknown field in feature_units.", `metadata.feature_units.${f}`);
  }
  if (metadata.minutes_unit === undefined) add("warning", "units-undeclared", "Legacy file: minutes are assumed elapsed playing minutes, not hours or nineties.", "metadata.minutes_unit");
  else if (metadata.minutes_unit !== "minutes") add("error", "units", "minutes_unit must be 'minutes'. No implicit conversion is performed.", "metadata.minutes_unit");
  const players = Array.isArray(data.players) ? data.players : [];
  const quality = inspectDataset(players, features.filter(f => supportedFeatures.includes(f)));
  errors += quality.errors; warnings += quality.warnings;
  quality.issues.forEach(i => { if (issues.length < 200) issues.push({ ...i, path: i.rows.length ? `players[${i.rows[0]}]${i.field ? `.${i.field}` : ""}` : "players" }); });
  players.forEach((p, i) => {
    if (!object(p)) return;
    for (const f of ["player_name", "club", "season", "archetype"]) if (!text(p[f], f === "season" ? 40 : 200)) add("error", "identity-type", `${f} must be a nonempty bounded string.`, `players[${i}].${f}`);
    if (!["Forward", "Winger", "Midfielder", "Defender"].includes(p.position)) add("error", "position", "Position must be Forward, Winger, Midfielder or Defender.", `players[${i}].position`);
    if (!Number.isInteger(p.cluster) || p.cluster < 0 || p.cluster > 4) add("error", "cluster", "Imported cluster must be an integer from 0 to 4.", `players[${i}].cluster`);
    if (["player_name", "club", "position", "season"].some(f => typeof p[f] === "string" && p[f].includes("__"))) add("error", "identity-delimiter", "Identity fields cannot contain '__', the interface key separator.", `players[${i}]`);
    for (const f of ["source_provider", "nationality", "preferred_foot", "current_status", "current_status_code", "current_news", "current_club", "primary_position", "secondary_position"]) if (p[f] !== undefined && p[f] !== null && (typeof p[f] !== "string" || p[f].length > 5000)) add("error", "context-type", `${f} must be a string when supplied.`, `players[${i}].${f}`);
  });
  if (!Array.isArray(data.cluster_profiles) || data.cluster_profiles.length > 100) add("error", "cluster-profiles", "cluster_profiles must be an array of at most 100 summaries (empty is allowed).", "cluster_profiles");
  else data.cluster_profiles.forEach((p, i) => {
    if (!object(p) || !text(p.archetype)) add("error", "cluster-profile", "Cluster summary needs an archetype string.", `cluster_profiles[${i}]`);
    else for (const f of features) if (typeof p[f] !== "number" || !Number.isFinite(p[f]) || p[f] < 0) add("error", "cluster-profile", `Cluster summary needs a nonnegative ${f}.`, `cluster_profiles[${i}].${f}`);
  });
  if (metadata.row_count !== undefined && metadata.row_count !== players.length) add("warning", "coverage", "Supplied row_count differs; coverage will be derived from records.", "metadata.row_count");
  if (metadata.validation !== undefined) add("warning", "supplied-validation", "Supplied diagnostics are historical claims, not independently verified for this import.", "metadata.validation");
  return { profiles: players.length, errors, warnings, issues, truncated: errors + warnings > issues.length };
}

export function validateDataset(data) {
  const report = inspectImport(data);
  if (report.errors) {
    const first = report.issues.find(i => i.severity === "error");
    const error = new Error(`${first?.path ?? "dataset"}: ${first?.message ?? "Invalid dataset"} (${report.errors} blocking issue(s)).`);
    error.report = report; throw error;
  }
  return { ...data, metadata: { ...data.metadata, row_count: data.players.length, positions: [...new Set(data.players.map(p => p.position))], clubs: [...new Set(data.players.map(p => p.club))], seasons: [...new Set(data.players.map(p => p.season))], data_mode: "local" } };
}

const recordKey = p => JSON.stringify([p.player_id, p.season, p.club, p.position]);
const groupKey = p => JSON.stringify([p.player_id, p.season]);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const metric = (p, f) => typeof p?.[f] === "number" && Number.isFinite(p[f]) && p[f] >= 0 ? p[f] : null;
const contextFields = ["player_name", "club", "position", "archetype", "cluster", "source_provider", "last_match_date", "age", "current_age", "nationality", "preferred_foot", "current_club", "current_status", "current_status_code", "current_news", "current_context_as_of"];
const totalFields = ["matches", "goals", "xg", "assists", "xa", "shots", "key_passes", "xg_chain", "xg_buildup", "non_penalty_goals", "non_penalty_xg"];

export function compareDatasets(previous, current) {
  // Reject ambiguous/malformed files rather than inventing a correspondence.
  validateDataset(previous); validateDataset(current);
  const oldNamespace = previous.metadata.player_id_namespace, newNamespace = current.metadata.player_id_namespace;
  if (oldNamespace && newNamespace && oldNamespace !== newNamespace) throw new Error("Player ID namespaces differ; a verified cross-provider mapping is required before comparing records.");
  if (!(oldNamespace && newNamespace && oldNamespace === newNamespace) && previous.metadata.source_provider && current.metadata.source_provider && previous.metadata.source_provider !== current.metadata.source_provider) throw new Error("Sources differ and shared ID namespaces are not declared. Verify IDs and declare the same player_id_namespace in both files before comparing.");
  const ordered = rows => [...rows].sort((a, b) => recordKey(a).localeCompare(recordKey(b)));
  const before = new Map(ordered(previous.players).map(p => [recordKey(p), p])), after = new Map(ordered(current.players).map(p => [recordKey(p), p]));
  const pairs = []; const oldGroups = new Map(), newGroups = new Map();
  for (const p of previous.players) { const k = groupKey(p); oldGroups.set(k, [...(oldGroups.get(k) ?? []), p]); }
  for (const p of current.players) { const k = groupKey(p); newGroups.set(k, [...(newGroups.get(k) ?? []), p]); }
  for (const [k, p] of before) if (after.has(k)) { pairs.push([p, after.get(k)]); after.delete(k); before.delete(k); }
  // An unambiguous sole spell may move club/position. Multi-spell records never get guessed/merged.
  for (const [k, p] of before) {
    const group = newGroups.get(groupKey(p));
    if (oldGroups.get(groupKey(p)).length === 1 && group?.length === 1 && after.has(recordKey(group[0]))) { pairs.push([p, group[0]]); before.delete(k); after.delete(recordKey(group[0])); }
  }
  const features = [...new Set([...previous.metadata.features, ...current.metadata.features])];
  const metricChanges = Object.fromEntries(features.map(f => [f, { changed: 0, increased: 0, decreased: 0, unavailableBefore: 0, unavailableAfter: 0, coverageBefore: previous.players.filter(p => previous.metadata.features.includes(f) && metric(p, f) !== null).length, coverageAfter: current.players.filter(p => current.metadata.features.includes(f) && metric(p, f) !== null).length }]));
  const changes = [], affected = new Map(); let changed = 0;
  const mark = (p, field) => { const k = JSON.stringify([p.position, p.season]); if (!affected.has(k)) affected.set(k, { position: p.position, season: p.season, fields: new Set() }); affected.get(k).fields.add(field); };
  const detail = (kind, a, b, fields) => { if (changes.length < 200) changes.push({ kind, playerId: (b ?? a).player_id, name: (b ?? a).player_name, season: (b ?? a).season, previousClub: a?.club ?? null, currentClub: b?.club ?? null, fields }); };
  for (const [a, b] of pairs) {
    const fields = [];
    for (const f of features) {
      const x = previous.metadata.features.includes(f) ? metric(a, f) : null, y = current.metadata.features.includes(f) ? metric(b, f) : null;
      if (x === y) continue;
      const s = metricChanges[f]; s.changed++; if (x === null) s.unavailableBefore++; else if (y === null) s.unavailableAfter++; else if (y > x) s.increased++; else s.decreased++;
      fields.push({ field: f, before: x, after: y, impact: "Ranks, similarity and briefs; pooled style-rule replay may change" }); mark(a, f); mark(b, f);
    }
    for (const f of ["minutes", ...totalFields, ...contextFields]) if (!same(a[f], b[f])) {
      fields.push({ field: f, before: a[f] ?? null, after: b[f] ?? null, impact: f === "minutes" ? "Sample adjustment, ranks, similarity and minimum-minutes gates" : totalFields.includes(f) ? "Source totals and consistency checks; scoring changes only if selected rates/minutes also change" : ["club", "position"].includes(f) ? "Cohort membership, filters and saved interface references" : f === "player_name" ? "Display and saved interface references; not raw statistical scores" : ["cluster", "archetype"].includes(f) ? "Supplied style/group displays; not metric-based scoring" : "Context, evidence dates or filters; not metric-based scores" });
      if (["minutes", "position", "club"].includes(f)) { mark(a, f); mark(b, f); }
    }
    if (fields.length) { changed++; detail("changed", a, b, fields); }
  }
  for (const p of before.values()) { detail("removed", p, null, []); mark(p, "membership"); }
  for (const p of after.values()) { detail("added", null, p, []); mark(p, "membership"); }
  const metadataChanges = ["dataset_version", "generated_at", "source_provider", "player_id_namespace", "model_version", "context_version", "current_context_as_of", "feature_units", "minutes_unit", "reliability_prior_minutes", "minimum_minutes", "features"].filter(f => !same(previous.metadata[f], current.metadata[f])).map(f => ({ field: f, before: previous.metadata[f] ?? null, after: current.metadata[f] ?? null }));
  const addedFeatures = current.metadata.features.filter(f => !previous.metadata.features.includes(f)), removedFeatures = previous.metadata.features.filter(f => !current.metadata.features.includes(f));
  if (addedFeatures.length || removedFeatures.length) for (const p of [...previous.players, ...current.players]) mark(p, "feature-set");
  return { schemaVersion: 1, previousVersion: previous.metadata.dataset_version ?? "unversioned", currentVersion: current.metadata.dataset_version ?? "unversioned", previousProfiles: previous.players.length, currentProfiles: current.players.length, matched: pairs.length, changed, unchanged: pairs.length - changed, added: after.size, removed: before.size, addedFeatures, removedFeatures, metricChanges, metadataChanges, affectedCohorts: [...affected.values()].map(c => ({ ...c, fields: [...c.fields].sort() })), changes, truncated: changed + after.size + before.size > changes.length, note: "IDs must use the same namespace. Match by ID/season/club/position; pair moved sole spells only. No fuzzy name merge. Peer ranks can change even for unchanged rows. A changed model version does not refit imported clusters. No source data or notes are modified." };
}
