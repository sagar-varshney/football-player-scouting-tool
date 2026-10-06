import test from "node:test";
import assert from "node:assert/strict";
import { presetBrief, requirementLabel, searchPresets } from "../lib/workflow.ts";
import { validateBrief } from "../lib/recruitment.ts";

test("search presets preserve cohort and sample controls without mutating the old brief",()=>{
  const base={name:"Custom",position:"Winger",season:"2025-2026",minimumMinutes:1350,rules:[]};
  for(const preset of searchPresets){
    const next=presetBrief(base,preset.id,[...preset.metrics]);
    assert.equal(next.position,base.position);assert.equal(next.season,base.season);assert.equal(next.minimumMinutes,1350);
    assert.equal(next.rules.length,3);assert.equal(next.rules[0].required,true);assert.equal(next.rules[1].required,false);
    assert.deepEqual(validateBrief(next),next);
  }
  assert.deepEqual(base.rules,[]);
});
test("presets respect supplied coverage and unavailable metrics remain unknown",()=>{
  const base={name:"Custom",position:"Defender",season:"Demo 02",minimumMinutes:900,rules:[]};
  assert.equal(presetBrief(base,"scoring",[]),base);
  assert.equal(presetBrief(base,"invalid",["xg_p90"]),base);
  assert.equal(presetBrief(base,"scoring",["xg_p90"]).rules.length,1);
  assert.equal(requirementLabel("Expected goals",false,true),"Expected goals: Unknown");
  assert.equal(requirementLabel("Expected goals",false,false),"Expected goals: Missed");
});
