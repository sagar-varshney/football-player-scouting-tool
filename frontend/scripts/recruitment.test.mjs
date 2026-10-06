import test from "node:test";
import assert from "node:assert/strict";
import { assessBrief, buildPercentiles, identity, initialBrief, observed, rankingDiagnostics, resemblance, safeEvidenceUrl, validateBrief, validateProject, weights } from "../lib/recruitment.ts";

const features = ["goals_p90","xg_p90","key_passes_p90"];
function player(i, extra={}) { return { player_id:i,player_name:`Player ${i}`,club:"Example Club",position:"Winger",season:"Demo 02",minutes:1800,archetype:"Example",cluster:0,goals_p90:i/10,xg_p90:i/8,key_passes_p90:i/4,...extra }; }
const pool = Array.from({length:18},(_,i)=>player(i+1));
const brief = {name:"Test brief",position:"Winger",season:"Demo 02",minimumMinutes:900,rules:[{feature:"goals_p90",minimum:75,unit:"percentile",required:true,weight:70},{feature:"key_passes_p90",minimum:60,unit:"percentile",required:false,weight:30}]};

test("percentiles preserve midpoint ties and reject single-profile comparative evidence",()=>{
  const rows=[player(1),player(2,{goals_p90:.1}),player(3,{goals_p90:.3})];
  const lookup=buildPercentiles(rows,["goals_p90"],0);
  assert.equal(lookup[identity(rows[0])].goals_p90,25);
  assert.equal(lookup[identity(rows[1])].goals_p90,25);
  assert.equal(lookup[identity(rows[2])].goals_p90,100);
  assert.deepEqual(buildPercentiles([rows[0]],["goals_p90"])[identity(rows[0])],{});
});
test("missing and negative values are not ranked as observed zero",()=>{
  const missing=player(19,{goals_p90:undefined}), negative=player(20,{goals_p90:-1});
  assert.equal(observed(negative,"goals_p90"),null);
  const lookup=buildPercentiles([...pool,missing,negative],features);
  assert.equal(lookup[identity(missing)].goals_p90,undefined);
  assert.equal(resemblance(pool[0],missing,features,lookup),null);
  const assessment=assessBrief(missing,brief,lookup);
  assert.equal(assessment.eligible,false);assert.equal(assessment.unknownCount,1);
  assert.equal(assessment.checks[0].value,null);
});
test("mandatory rules gate eligibility even at zero weight; preferences only affect attainment",()=>{
  const lookup=buildPercentiles(pool,features);
  const changed={...brief,rules:[{...brief.rules[0],weight:0},{...brief.rules[1],required:false}]};
  const result=assessBrief(pool[0],changed,lookup);
  assert.equal(result.eligible,false);
  const soft={...brief,rules:brief.rules.map(r=>({...r,required:false}))};
  assert.equal(assessBrief(pool[0],soft,lookup).eligible,true);
  assert.equal(assessBrief(pool[0],{...brief,rules:brief.rules.map(r=>({...r,weight:0}))},lookup).score,null);
});
test("brief thresholds use chosen units, do not overwrite statistics, and fully attained requirements cap at 100",()=>{
  const p=pool.at(-1);const snapshot=JSON.stringify(p);
  const raw={...brief,rules:[{feature:"goals_p90",minimum:.4,unit:"per90",required:true,weight:100}]};
  assert.equal(assessBrief(p,raw,{}).score,100);
  assert.equal(JSON.stringify(p),snapshot);
  assert.equal(assessBrief(p,{...raw,season:"Demo 01"},{}).eligible,false);
  assert.equal(assessBrief(p,{...raw,minimumMinutes:3000},{}).eligible,false);
});
test("resemblance is distinct from brief attainment and is limited to the same season and position",()=>{
  const lookup=buildPercentiles(pool,features);
  assert.equal(resemblance(pool[0],pool[0],features,lookup),100);
  assert.equal(resemblance(pool[0],pool[1],features,lookup),100-100/17);
  assert.equal(resemblance(pool[0],{...pool[1],season:"Demo 01"},features,lookup),null);
  assert.equal(resemblance(pool[0],{...pool[1],position:"Defender"},features,lookup),null);
  assert.equal(resemblance(pool[0],pool[1],features,lookup,Object.fromEntries(features.map(f=>[f,0]))),null);
  assert.equal(weights("Winger").key_passes_p90,1.4);
});
test("diagnostics are bounded, deterministic, retain baseline self-agreement, and report cosine separately",()=>{
  const result=rankingDiagnostics(pool,pool[9],features);
  assert.equal(result.k,10);assert.equal(result.priors.find(p=>p.prior===900).retained,100);
  assert.equal(result.ablations.length,features.length);
  assert.ok(result.correlations.length>0);
  for(const row of [...result.priors,...result.ablations,...result.cohorts]) assert.ok(row.retained===null||(row.retained>=0&&row.retained<=100));
  for(const row of result.cosine) assert.ok(row.score>=-1.000001&&row.score<=1.000001);
  assert.deepEqual(result,rankingDiagnostics(pool,pool[9],features));
  assert.deepEqual(rankingDiagnostics([pool[0]],pool[0],features).baseline,[]);
});
test("project imports validate schema, metric ranges, duplicate candidates and unsafe evidence links",()=>{
  const project={id:"project-1",name:"Example",brief,entries:[{key:identity(pool[0]),status:"Review",strengths:"Measured creation",concerns:"Needs video",note:"Example only",evidenceUrl:"https://example.com/video"}],datasetVersion:"fixture-1",createdAt:"2026-10-06T00:00:00Z"};
  assert.deepEqual(validateProject({schemaVersion:1,project}),project);
  assert.throws(()=>validateProject({schemaVersion:2,project}));
  assert.throws(()=>validateProject({schemaVersion:1,project:{...project,entries:[...project.entries,...project.entries]}}));
  assert.throws(()=>validateProject({schemaVersion:1,project:{...project,entries:[{...project.entries[0],evidenceUrl:"javascript:alert(1)"}]}}));
  assert.throws(()=>validateBrief({...brief,rules:[{...brief.rules[0],minimum:101}]}));
  assert.throws(()=>validateBrief({...brief,rules:[brief.rules[0],brief.rules[0]]}));
  assert.equal(safeEvidenceUrl("data:text/html,test"),null);assert.equal(safeEvidenceUrl("https://example.com"),"https://example.com/");
});
test("initial briefs respect actual feature coverage",()=>{
  assert.deepEqual(initialBrief("Winger","Demo 02",["goals_p90"]).rules.map(r=>r.feature),["goals_p90"]);
});
