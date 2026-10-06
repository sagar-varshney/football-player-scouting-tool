import test from "node:test";
import assert from "node:assert/strict";
import { quoteCsv } from "../lib/csv.ts";
test("CSV exports neutralize spreadsheet formulas, including whitespace prefixes", () => {
  for (const value of ["=1+1", "+SUM(A1)", "@cmd", "-1+2", "\t=1+1", "  =1+1"]) assert.ok(quoteCsv(value).startsWith('"\''));
  assert.equal(quoteCsv('A "quoted" note'), '"A ""quoted"" note"');
  assert.equal(quoteCsv(0.25), '"0.25"');
});
