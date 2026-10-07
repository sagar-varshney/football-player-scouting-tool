import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData, demoData, features } from "../lib/demo-data.ts";

test("fictional generator is deterministic and preserves demo identities", () => {
  assert.deepEqual(createDemoData(), demoData);
  assert.notDeepEqual(createDemoData(42), demoData);
  assert.equal(demoData.players.length, 1280);
  assert.equal(new Set(demoData.players.map(p => p.player_id)).size, 640);
  assert.equal(demoData.metadata.clubs.length, 32);
  for (const position of demoData.metadata.positions) {
    for (const season of demoData.metadata.seasons) {
      assert.equal(demoData.players.filter(p => p.position === position && p.season === season).length, 160);
    }
  }
  assert.equal(new Set(demoData.players.map(p => `${p.player_id}:${p.season}`)).size, 1280);
  assert.equal(demoData.metadata.dataset_version, "synthetic-v4");
  for (const p of demoData.players) {
    assert.match(p.player_name, /^Demo /);
    assert.match(p.club, /^Example Club /);
    assert.equal(p.source_provider, "synthetic");
    assert.equal(p.provider_player_id, undefined);
    assert.ok(p.minutes <= p.matches * 90);
  }
});

test("fictional totals and per-90 rates obey their authored relationships", () => {
  for (const p of demoData.players) {
    assert.ok(p.goals <= p.shots);
    assert.ok(p.assists <= p.key_passes);
    assert.ok(p.xg <= p.shots);
    for (const [total, rate] of [["goals", "goals_p90"], ["xg", "xg_p90"], ["assists", "assists_p90"], ["xa", "xa_p90"], ["shots", "shots_p90"], ["key_passes", "key_passes_p90"]]) {
      assert.ok(Math.abs(p[rate] - p[total] / (p.minutes / 90)) <= 0.000051);
    }
    assert.ok(p.xg_chain_p90 >= p.xg_buildup_p90 + p.xg_p90 + p.xa_p90 - 0.0002);
    for (const f of features) assert.ok(Number.isFinite(p[f]) && p[f] >= 0);
  }
});

test("every position includes trends, small samples and genuine zero output", () => {
  for (const position of demoData.metadata.positions) {
    const profile = (index, season) => demoData.players.find(p => p.position === position && p.player_id % 100 === index && p.season === `Demo 0${season}`);
    assert.ok(profile(3, 2).xg_p90 > profile(3, 1).xg_p90);
    assert.ok(profile(4, 2).xg_p90 < profile(4, 1).xg_p90);
    assert.equal(profile(6, 2).minutes, 180);
    assert.equal(profile(14, 2).goals_p90, 0);
    assert.ok(profile(13, 2).goals > profile(13, 2).xg);
  }
});
