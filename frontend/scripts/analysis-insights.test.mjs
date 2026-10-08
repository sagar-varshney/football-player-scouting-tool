import assert from "node:assert/strict";
import test from "node:test";
import { demoData } from "../lib/demo-data.ts";
import { deriveDemoStyles, styleLabel, styleRules } from "../lib/demo-model.ts";
import { adjustedRand, buildSnapshot, clusterAudit, rawPositionRanks, replaySnapshot, sampledSilhouette, seasonEvidence } from "../lib/analysis-insights.ts";
import { inspectDataset } from "../lib/data-quality.mjs";
import { validateDataset } from "./import-data.mjs";
import { initialBrief } from "../lib/recruitment.ts";

test("explanations reproduce every label and respect rule precedence and strict boundaries", () => {
  for (const p of demoData.players) {
    const ranks = rawPositionRanks(demoData.players, p, demoData.metadata.features);
    assert.equal(styleRules(p.position, ranks).find(r => r.met).label, p.archetype);
  }
  const ranks = Object.fromEntries(demoData.metadata.features.map(f => [f, 50]));
  assert.equal(styleLabel("Forward", { ...ranks, goals_p90: 80, xg_p90: 80, assists_p90: 58, xa_p90: 58, key_passes_p90: 58 }), "Balanced Forward");
  assert.equal(styleLabel("Forward", { ...ranks, goals_p90: 80, xg_p90: 80, assists_p90: 57.9, xa_p90: 57.9, key_passes_p90: 57.9 }), "Penalty Box Finisher");
  assert.deepEqual(deriveDemoStyles(demoData.players, demoData.metadata.features), demoData.players.map(p => p.archetype));
});

test("cluster metrics are label invariant, separated and deterministic; cancellation preserves input", async () => {
  assert.equal(adjustedRand([0, 0, 1, 1], [9, 9, 8, 8]), 1);
  assert.equal(adjustedRand([0], [0]), null);
  assert.ok(adjustedRand([0, 0, 1, 1], [0, 1, 0, 1]) < 0);
  const points = [[0], [.1], [10], [10.1]];
  assert.ok(sampledSilhouette(points, [0, 0, 1, 1]) > .98);
  assert.equal(sampledSilhouette(points, [0, 0, 0, 0]), null);
  const pool = demoData.players.slice(0, 48), before = JSON.stringify(pool);
  const a = await clusterAudit(pool, demoData.metadata.features, { yieldTask: async () => {} });
  assert.deepEqual(a, await clusterAudit(pool, demoData.metadata.features, { yieldTask: async () => {} }));
  assert.equal(a.rows.length, 6);
  assert.ok(a.rows.every(r => !r.error));
  await assert.rejects(clusterAudit(pool, demoData.metadata.features, { cancelled: () => true, yieldTask: async () => {} }), /cancelled/);
  assert.equal(JSON.stringify(pool), before);
});

test("data checks reject ambiguous identities but retain transfer spells and flag aliases/outliers", () => {
  const a = { ...demoData.players[0] };
  assert.ok(inspectDataset([a, { ...a }], demoData.metadata.features).errors > 0);
  const clash = { ...a, player_id: 9999 };
  assert.throws(() => validateDataset({ ...demoData, players: [a, clash] }), /interface identity/);
  const transfer = { ...a, club: "Another Example Club", player_name: "Alternate Example Name", shots_p90: 13 };
  const checked = inspectDataset([a, transfer], demoData.metadata.features);
  assert.equal(checked.errors, 0);
  assert.ok(checked.issues.some(i => i.code === "transfer"));
  assert.ok(checked.issues.some(i => i.code === "name-variants"));
  assert.ok(checked.issues.some(i => i.code === "extreme-rate"));
  assert.equal(validateDataset({ ...demoData, players: [a, transfer] }).players.length, 2);
});

test("season evidence uses IDs, preserves spells and leaves missing metrics unavailable", () => {
  const p = demoData.players.find(p => p.player_name === "Demo Winger 03");
  const sameId = demoData.players.filter(q => q.player_id === p.player_id);
  const renamed = sameId.map(q => ({ ...q, player_name: "Different spelling" }));
  const rows = seasonEvidence(renamed, p, "xg_p90");
  assert.equal(rows.length, 2);
  assert.ok(rows[1].raw > rows[0].raw);
  const extra = { ...renamed[1], club: "Transfer Club", xg_p90: undefined };
  const spells = seasonEvidence([...renamed, extra], p, "xg_p90");
  assert.equal(spells.length, 3);
  assert.equal(spells.filter(r => r.transfer).length, 2);
  assert.equal(spells.find(r => r.club === "Transfer Club").raw, null);
});

test("snapshots replay exact results, preserve settings, reject tampering and avoid shared references", () => {
  const features = demoData.metadata.features, target = demoData.players.find(p => p.player_name === "Demo Winger 01" && p.season === "Demo 02");
  const input = { players: demoData.players, target, features, brief: initialBrief("Winger", "Demo 02", features), priorities: { Finishing: 100, Creation: 100, Involvement: 100 }, datasetVersion: "synthetic-v4", showFailures: true, sort: "similarity" };
  const snapshot = buildSnapshot(input, "2026-10-08T00:00:00Z");
  assert.equal(snapshot.input.players.length, 160);
  assert.equal(replaySnapshot(JSON.parse(JSON.stringify(snapshot))).matchesExport, true);
  assert.equal(snapshot.input.showFailures, true);
  const corrupted = JSON.parse(JSON.stringify(snapshot)); corrupted.input.players[0].minutes++;
  assert.throws(() => replaySnapshot(corrupted), /changed since export/);
  const settings = JSON.parse(JSON.stringify(snapshot)); settings.input.priorities.Finishing = -1;
  assert.throws(() => replaySnapshot(settings), /priorities/);
  const wrongResults = JSON.parse(JSON.stringify(snapshot)); wrongResults.results = [];
  assert.equal(replaySnapshot(wrongResults).matchesExport, false);
  const original = target.goals_p90;
  snapshot.input.target.goals_p90 = 99;
  assert.equal(target.goals_p90, original);
});
