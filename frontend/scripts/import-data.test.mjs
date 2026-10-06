import test from "node:test";
import assert from "node:assert/strict";
import { validateDataset } from "./import-data.mjs";

const fixture = () => ({ metadata: { features: ["goals_p90"], row_count: 999 }, cluster_profiles: [], players: [1, 2].map(id => ({ player_id: id, player_name: `Example ${id}`, club: "Example", season: "Demo", position: "Winger", minutes: 900, cluster: 0, archetype: "Combination Winger", goals_p90: 0.3 })) });
test("import derives coverage from profiles rather than trusting metadata", () => { const value = validateDataset(fixture()); assert.equal(value.metadata.row_count, 2); assert.deepEqual(value.metadata.seasons, ["Demo"]); });
test("import rejects malformed metrics and duplicate profile identities", () => { const bad = fixture(); bad.players[0].goals_p90 = "NaN"; assert.throws(() => validateDataset(bad)); const dup = fixture(); dup.players[1] = dup.players[0]; assert.throws(() => validateDataset(dup)); });
test("import rejects unknown feature contracts", () => { const bad = fixture(); bad.metadata.features = ["rating"]; assert.throws(() => validateDataset(bad)); });
