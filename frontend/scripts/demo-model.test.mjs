import assert from "node:assert/strict";
import test from "node:test";
import { demoData } from "../lib/demo-data.ts";
import { deriveDemoStyles, fitDemoKMeans, styleLabel } from "../lib/demo-model.ts";
import { assessBrief, buildPercentiles, initialBrief, resemblance } from "../lib/recruitment.ts";

test("K-means fits standardized metrics reproducibly, with non-empty nearest-center groups", () => {
  const before = JSON.stringify(demoData.players);
  const fit = fitDemoKMeans(demoData.players, demoData.metadata.features);
  assert.deepEqual(fit, fitDemoKMeans(demoData.players, demoData.metadata.features));
  assert.equal(JSON.stringify(demoData.players), before);
  assert.equal(new Set(fit.assignments).size, 5);
  assert.ok(fit.inertia <= fitDemoKMeans(demoData.players, demoData.metadata.features, 42, 5, 1).inertia);
  let inertia = 0;
  demoData.players.forEach((p, i) => {
    assert.equal(p.cluster, fit.assignments[i]);
    const point = demoData.metadata.features.map((f, j) => (p[f] - fit.mean[j]) / fit.scale[j]);
    const distances = fit.centers.map(center => center.reduce((sum, value, j) => sum + (value - point[j]) ** 2, 0));
    assert.ok(distances[p.cluster] <= Math.min(...distances) + 1e-8);
    inertia += distances[p.cluster];
  });
  assert.ok(Math.abs(inertia - fit.inertia) < 1e-8);
  assert.throws(() => fitDemoKMeans([{ position: "Winger", x: NaN }], ["x"], 42, 1));
  assert.throws(() => fitDemoKMeans([{ position: "Winger", x: 1 }, { position: "Winger", x: 1 }], ["x"], 42, 2));
});

test("metric-based labels use the local ordered rules, independently of cluster and context", () => {
  const expected = deriveDemoStyles(demoData.players, demoData.metadata.features);
  assert.deepEqual(demoData.players.map(p => p.archetype), expected);
  assert.deepEqual(deriveDemoStyles(demoData.players.map(p => ({ ...p, cluster: 99, age: 100, current_status: "Unavailable" })), demoData.metadata.features), expected);
  const ranks = value => Object.fromEntries(demoData.metadata.features.map(f => [f, value]));
  assert.equal(styleLabel("Forward", ranks(80)), "Complete Forward");
  assert.equal(styleLabel("Winger", ranks(80)), "Goal-Creating Winger");
  assert.equal(styleLabel("Midfielder", ranks(80)), "Goal-Creating Midfielder");
  assert.equal(styleLabel("Defender", ranks(80)), "Attacking Defender");
  assert.equal(styleLabel("Winger", { ...ranks(50), assists_p90: 80, xa_p90: 80, key_passes_p90: 80, xg_buildup_p90: 70 }), "Wide Playmaker");
  assert.equal(styleLabel("Other", ranks(50)), "Unclassified Role");
});

test("fictional context ages consistently, keeps shirts unique and does not affect scores", () => {
  const first = demoData.players.filter(p => p.season === "Demo 01");
  const last = demoData.players.filter(p => p.season === "Demo 02");
  const shirts = new Set();
  for (const p of last) {
    const previous = first.find(q => q.player_id === p.player_id);
    assert.equal(p.age, previous.age + 1);
    assert.equal(p.nationality, previous.nationality);
    assert.equal(p.preferred_foot, previous.preferred_foot);
    assert.equal(p.shirt_number, previous.shirt_number);
    assert.equal(p.context_source, "synthetic");
    assert.equal(p.context_verified, "false");
    assert.equal(p.current_fpl_player_id, undefined);
    assert.equal(p.current_context_as_of, undefined);
    assert.match(p.current_news, /Fictional/);
    const key = `${p.club}:${p.shirt_number}`;
    assert.ok(!shirts.has(key)); shirts.add(key);
  }
  const pool = last.filter(p => p.position === "Winger");
  const features = demoData.metadata.features;
  const lookup = buildPercentiles(pool, features);
  const brief = initialBrief("Winger", "Demo 02", features);
  const changed = { ...pool[0], age: 99, current_age: 99, current_status: "Injured", preferred_foot: "Both" };
  assert.deepEqual(assessBrief(changed, brief, lookup), assessBrief(pool[0], brief, lookup));
  assert.equal(resemblance(changed, pool[1], features, lookup), resemblance(pool[0], pool[1], features, lookup));
});
