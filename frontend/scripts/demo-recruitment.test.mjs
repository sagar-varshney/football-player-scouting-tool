import test from "node:test";
import assert from "node:assert/strict";
import { demoData } from "../lib/demo-data.ts";
import { auditDataset } from "../lib/recruitment.ts";

test("bundled fictional demo completes the recruitment audit without imported data", async () => {
  const before = JSON.stringify(demoData);
  const result = await auditDataset(demoData.players, demoData.metadata.features);
  assert.equal(demoData.metadata.data_mode, "demo");
  assert.equal(demoData.metadata.source_provider, "synthetic");
  assert.equal(result.profiles, 128);
  assert.equal(result.tested, 128);
  assert.equal(result.cohorts, 8);
  assert.equal(result.rows.length, 128);
  assert.equal(JSON.stringify(demoData), before);
});
