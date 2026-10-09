import test from "node:test";
import assert from "node:assert/strict";
import { behaviorAudit } from "../lib/behavior-audit.ts";
import { buildPercentiles, identity, rankSimilar } from "../lib/recruitment.ts";
import { demoData } from "../lib/demo-data.ts";
test("behavior audit passes all controlled position/sample/completeness scenarios and is deterministic", async () => {
  const data = demoData.players, before = JSON.stringify(data);
  const options = { yieldTask: async () => {} }, result = await behaviorAudit(data, demoData.metadata.features, options);
  assert.equal(result.failed, 0, JSON.stringify(result.failures)); assert.equal(result.fixtureScenarios, 36); assert.ok(result.checks > 400); assert.ok(result.activeProfiles > 0);
  assert.deepEqual(result, await behaviorAudit(data, demoData.metadata.features, options)); assert.equal(JSON.stringify(data), before);
  for (const position of ["Forward", "Winger", "Midfielder", "Defender"]) for (const sample of ["Under 900 min", "900–1,799 min", "1,800+ min"]) assert.ok(result.groups.some(g => g.scope === "Controlled fixtures" && g.position === position && g.sample === sample && g.completeness === "All metrics missing"));
});
test("behavior audit reports incomplete active strata and cancellation discards partial results", async () => {
  const rows = demoData.players.slice(0, 10).map(p => ({ ...p, goals_p90: undefined }));
  const result = await behaviorAudit(rows, demoData.metadata.features, { yieldTask: async () => {} }); assert.equal(result.failed, 0); assert.ok(result.groups.some(g => g.scope === "Active dataset sample" && g.completeness === "Incomplete"));
  await assert.rejects(behaviorAudit(rows, demoData.metadata.features, { cancelled: () => true, yieldTask: async () => {} }), /cancelled/);
  await assert.rejects(behaviorAudit(rows, [], { yieldTask: async () => {} }), /at least one/);
});
test("shared match ranking is deterministic, blocks missing evidence and zero weights, and excludes other cohorts", () => {
  const target = demoData.players[0], peer = { ...target, player_id: 999, player_name: "Tied peer A" }, other = { ...peer, player_id: 998, player_name: "Tied peer B" }, missing = { ...peer, player_name: "Missing metric", goals_p90: undefined }, cross = { ...peer, player_name: "Other season", season: "Other season" };
  const pool = [target, peer, other, missing, cross], features = demoData.metadata.features, lookup = buildPercentiles(pool.filter(p => p.season === target.season), features);
  const rankings = rankSimilar(pool, target, features, lookup); assert.deepEqual(rankings.map(r => r.player.player_name), [peer.player_name, other.player_name]);
  assert.deepEqual(rankings, rankSimilar([...pool].reverse(), target, features, lookup)); assert.equal(rankSimilar(pool, target, features, lookup, { Finishing:0, Creation:0, Involvement:0 }).length, 0); assert.equal(rankSimilar(pool, missing, features, lookup).length, 0);
  assert.ok(rankings.every(r => identity(r.player) !== identity(target)));
});
