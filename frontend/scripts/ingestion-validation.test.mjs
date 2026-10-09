import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectImport, validateDataset, compareDatasets } from "../lib/dataset-contract.mjs";
import { inspectDataset } from "../lib/data-quality.mjs";
import { importDataset } from "./import-data.mjs";

const fixture = () => ({ metadata: { features: ["goals_p90", "key_passes_p90"], feature_units: { goals_p90: "per90", key_passes_p90: "per90" }, minutes_unit: "minutes", dataset_version: "example-v1" }, cluster_profiles: [], players: [1, 2, 3].map(id => ({ player_id: id, player_name: `Example ${id}`, club: "Example Club", season: "Demo 02", position: "Winger", minutes: 900, matches: 10, cluster: 0, archetype: "Example", goals: id, goals_p90: id / 10, key_passes: id * 10, key_passes_p90: id })) });
test("schema errors are structured and tolerate malformed JSON values without crashing the inspector", () => {
  for (const bad of [null, [], "data", {}, { metadata: null, players: [null, 42, []], cluster_profiles: null }]) { const report = inspectImport(bad); assert.ok(report.errors > 0); assert.ok(report.issues.every(i => typeof i.path === "string")); assert.throws(() => validateDataset(bad)); }
  assert.equal(inspectDataset(null, []).errors, 1);
});
test("selected statistics never accept strings, infinities, negatives or missing values", () => {
  for (const v of ["0.3", NaN, Infinity, -1, undefined, null]) { const d = fixture(); d.players[0].goals_p90 = v; assert.ok(inspectImport(d).issues.some(i => i.severity === "error" && i.path === "players[0].goals_p90")); }
  const d = fixture(); delete d.players[0].goals; assert.equal(validateDataset(d).players.length, 3); // optional total, not missing selected rate
});
test("explicit incompatible/incomplete units fail; legacy units are warning-only and no conversion occurs", () => {
  const d = fixture(); assert.equal(inspectImport(d).errors, 0); assert.equal(inspectImport(d).warnings, 0);
  for (const unit of ["total", "perMatch", "%", 90, null]) { const bad = fixture(); bad.metadata.feature_units.goals_p90 = unit; assert.throws(() => validateDataset(bad), /per90/); }
  const missing = fixture(); delete missing.metadata.feature_units.key_passes_p90; assert.throws(() => validateDataset(missing));
  const badMinutes = fixture(); badMinutes.metadata.minutes_unit = "hours"; assert.throws(() => validateDataset(badMinutes), /minutes_unit/);
  delete d.metadata.feature_units; delete d.metadata.minutes_unit;
  assert.equal(inspectImport(d).warnings, 2); assert.equal(validateDataset(d).players[0].goals_p90, .1);
});
test("counts, ISO dates, zero-minute rates and context types are checked, while rounding stays acceptable", () => {
  for (const [field, v] of [["shots", "10"], ["matches", 10.5], ["current_age", -1], ["current_context_as_of", "2026-02-30"], ["current_status", 3]]) { const d = fixture(); d.players[0][field] = v; assert.throws(() => validateDataset(d)); }
  const zero = fixture(); zero.players[0].minutes = 0; assert.throws(() => validateDataset(zero), /zero recorded minutes/);
  const rounded = fixture(); rounded.players[0].goals_p90 = .1001; assert.equal(inspectImport(rounded).warnings, 0);
  rounded.players[0].goals_p90 = 1; assert.ok(inspectImport(rounded).issues.some(i => i.code === "rate-total"));
});
test("identity collisions block but multi-club spells remain separate, and rename changes use stable IDs", () => {
  const duplicate = fixture(); duplicate.players.push({ ...duplicate.players[0] }); assert.throws(() => validateDataset(duplicate), /Duplicate/);
  const collision = fixture(); collision.players[1].player_name = collision.players[0].player_name; assert.throws(() => validateDataset(collision), /interface identity/);
  const transfer = fixture(); transfer.players.push({ ...transfer.players[0], club: "Other Club" }); assert.equal(validateDataset(transfer).players.length, 4);
  const renamed = fixture(); renamed.players[0].player_name = "Example Full Name";
  const report = compareDatasets(fixture(), renamed); assert.equal(report.changed, 1); assert.equal(report.added, 0); assert.equal(report.removed, 0); assert.equal(report.changes[0].fields[0].field, "player_name"); assert.equal(report.affectedCohorts.length, 0);
});
test("version comparisons count all deltas, coverage, metadata and membership without modifying inputs", () => {
  const a = fixture(), b = fixture(); b.metadata.dataset_version = "example-v2"; b.players[0].goals_p90 += .2; b.players[1].minutes = 1000; b.players.pop(); b.players.push({ ...b.players[0], player_id: 4, player_name: "Example 4" });
  const before = JSON.stringify([a, b]), diff = compareDatasets(a, b);
  assert.equal(diff.changed, 2); assert.equal(diff.added, 1); assert.equal(diff.removed, 1); assert.equal(diff.matched, 2); assert.equal(diff.metricChanges.goals_p90.changed, 1); assert.equal(diff.metricChanges.goals_p90.increased, 1);
  assert.equal(diff.affectedCohorts[0].fields.includes("minutes"), true); assert.ok(diff.metadataChanges.some(c => c.field === "dataset_version")); assert.equal(JSON.stringify([a, b]), before);
  assert.deepEqual(diff, compareDatasets({ ...a, players: [...a.players].reverse() }, b));
});
test("a moved sole spell is paired, but ambiguous transfer spells are never guessed", () => {
  const a = fixture(), b = fixture(); b.players[0].club = "New Club"; b.players[0].position = "Forward";
  const sole = compareDatasets(a, b); assert.equal(sole.changed, 1); assert.equal(sole.added, 0); assert.equal(sole.affectedCohorts.length, 2);
  a.players.push({ ...a.players[0], club: "Second Club" }); b.players.push({ ...b.players[0], club: "Another Club" });
  const multi = compareDatasets(a, b); assert.equal(multi.added, 2); assert.equal(multi.removed, 2); assert.equal(multi.changed, 0);
});
test("feature removal and context-only edits explain different downstream effects", () => {
  const a = fixture(), b = fixture(); b.metadata.features = ["goals_p90"]; b.players[0].current_status = "Doubtful";
  const report = compareDatasets(a, b); assert.deepEqual(report.removedFeatures, ["key_passes_p90"]); assert.equal(report.metricChanges.key_passes_p90.coverageAfter, 0); assert.equal(report.metricChanges.key_passes_p90.unavailableAfter, 3);
  assert.ok(report.changes[0].fields.find(f => f.field === "current_status").impact.includes("not metric-based scores"));
});
test("totals-only edits and possible duplicate spell variants are surfaced without rewriting data", () => {
  const a = fixture(), b = fixture(); b.players[0].goals++;
  const report = compareDatasets(a, b); assert.equal(report.changed, 1); assert.equal(report.metricChanges.goals_p90.changed, 0); assert.equal(report.affectedCohorts.length, 0); assert.ok(report.changes[0].fields[0].impact.includes("Source totals"));
  const variant = { ...a.players[0], club: " example club " }; const quality = inspectDataset([...a.players, variant], a.metadata.features); assert.ok(quality.issues.some(i => i.code === "possible-duplicate")); assert.equal(quality.errors, 0);
  const negative = fixture(); negative.players[0].player_id = -1; assert.throws(() => validateDataset(negative), /nonnegative safe integer/);
});
test("comparison detail caps do not change totals and incompatible baselines cannot be compared", () => {
  const a = fixture(); a.players = Array.from({length:250}, (_, i) => ({ ...a.players[0], player_id: i, player_name: `Example ${i}` })); const b = structuredClone(a); b.players.forEach(p => p.goals_p90 += .1);
  const report = compareDatasets(a, b); assert.equal(report.changed, 250); assert.equal(report.metricChanges.goals_p90.changed, 250); assert.equal(report.changes.length, 200); assert.equal(report.truncated, true);
  b.metadata.minutes_unit = "nineties"; assert.throws(() => compareDatasets(a, b));
});
test("cross-provider ID namespaces cannot silently collide", () => {
  const a = fixture(), b = fixture(); a.metadata.source_provider = "example-source-a"; b.metadata.source_provider = "example-source-b";
  assert.throws(() => compareDatasets(a, b), /namespace/);
  a.metadata.player_id_namespace = b.metadata.player_id_namespace = "verified-common-ids"; assert.equal(compareDatasets(a, b).matched, 3);
  b.metadata.player_id_namespace = "different-ids"; assert.throws(() => compareDatasets(a, b), /namespaces differ/);
});
test("dry run and invalid imports leave active files byte-identical; successful import is atomic", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "scoutlab-ingestion-test-")), source = path.join(directory, "input.json"), active = path.join(directory, "scouting-data.json");
  const initial = JSON.stringify(fixture()); await writeFile(active, initial); const changed = fixture(); changed.metadata.dataset_version = "example-v2"; changed.players[0].goals_p90 += .1; await writeFile(source, JSON.stringify(changed));
  const preview = await importDataset(source, { directory, dryRun: true }); assert.equal(preview.applied, false); assert.equal(preview.report.comparison.changed, 1); assert.equal(await readFile(active, "utf8"), initial);
  changed.players[0].goals_p90 = "invalid"; await writeFile(source, JSON.stringify(changed)); await assert.rejects(importDataset(source, { directory })); assert.equal(await readFile(active, "utf8"), initial);
  await writeFile(source, JSON.stringify(fixture())); const result = await importDataset(source, { directory }); assert.equal(result.applied, true); assert.equal(JSON.parse(await readFile(active, "utf8")).metadata.row_count, 3); assert.ok(!(await readdir(directory)).some(f => f.endsWith(".tmp")));
  await assert.rejects(importDataset(source, { directory, reportPath: active }), /cannot overwrite/);
});
test("first import dry-run creates no storage; report export is an explicit separate action", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "scoutlab-first-import-test-")), directory = path.join(temp, "not-created"), source = path.join(temp, "source.json"), reportPath = path.join(temp, "report.json");
  await writeFile(source, JSON.stringify(fixture())); const result = await importDataset(source, { directory, dryRun: true, reportPath }); assert.equal(result.report.comparison, null); await assert.rejects(readdir(directory), { code: "ENOENT" }); assert.equal(JSON.parse(await readFile(reportPath, "utf8")).validation.errors, 0);
});
