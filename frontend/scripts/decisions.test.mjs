import test from "node:test";
import assert from "node:assert/strict";
import { assessBrief, auditCohort, auditDataset, briefReasons, buildPercentiles, evidenceSummary, identity, rankingDiagnostics, recordDecision, summarizeAudit, validReviewDate, validateProject } from "../lib/recruitment.ts";
const features=["goals_p90","key_passes_p90"];
const player=(i,extra={})=>({player_id:i,player_name:`Example ${i}`,club:"Example",position:"Winger",season:"Demo 02",minutes:1200,archetype:"Example",cluster:0,goals_p90:i/10,key_passes_p90:i/5,...extra});
const pool=Array.from({length:14},(_,i)=>player(i+1));
const brief={name:"Example brief",position:"Winger",season:"Demo 02",minimumMinutes:900,rules:[{feature:"goals_p90",unit:"per90",minimum:.5,weight:70,required:true},{feature:"key_passes_p90",unit:"per90",minimum:1.2,weight:30,required:false}]};

test("exclusion reasons distinguish mandatory gaps, preference misses and unavailable evidence",()=>{
  const p=player(4,{minutes:780});const r=briefReasons(p,brief,{});
  assert.equal(r.mandatoryMisses,2);assert.equal(r.unknown,false);
  assert.match(r.reasons[0].text,/120 minutes/);
  assert.match(r.reasons[1].text,/0.10 \/90 below minimum/);
  assert.equal(r.reasons[2].mandatory,false);
  assert.equal(briefReasons(player(6,{goals_p90:undefined}),brief,{}).unknown,true);
  assert.equal(assessBrief(player(6,{minutes:undefined}),{...brief,minimumMinutes:0},{}).eligible,false);
});
test("evidence separates sample, metric coverage, export age and squad context from match freshness",()=>{
  const e=evidenceSummary(player(1,{minutes:700,key_passes_p90:undefined,source_provider:"example",current_context_as_of:"2026-10-05"}),features,"2026-09-14T00:00:00Z",new Date("2026-10-06T00:00:00Z"));
  assert.equal(e.sample,"Early sample");assert.equal(e.available,1);assert.equal(e.ageDays,22);assert.equal(e.matchDate,null);assert.equal(e.contextDate,"2026-10-05");
  assert.match(e.exportLabel,/22 days/);assert.equal(evidenceSummary(pool[0],features).ageDays,null);
  assert.match(evidenceSummary(pool[0],features,"2027-01-01",new Date("2026-10-06")).exportLabel,/ahead/);
});
test("decision checkpoints preserve immutable history and reject invalid dates and excessive records",()=>{
  const entry={key:identity(pool[0]),status:"Review",strengths:"",concerns:"",note:"Watch full matches",evidenceUrl:"",nextAction:"Review pressing",reviewDate:"2026-10-10"};
  const updated=recordDecision(entry,"2026-10-06T00:00:00Z");assert.equal(entry.history,undefined);assert.equal(updated.history.length,1);
  const next=recordDecision({...updated,status:"Priority",note:"Video reviewed"},"2026-10-07T00:00:00Z");assert.equal(next.history[0].note,"Watch full matches");assert.equal(next.history[1].status,"Priority");
  assert.equal(validReviewDate("2026-02-31"),false);assert.equal(validReviewDate("2028-02-29"),true);assert.equal(validReviewDate(""),true);
  assert.throws(()=>recordDecision({...entry,reviewDate:"2026-02-31"}));assert.throws(()=>recordDecision({...entry,history:Array(100).fill(updated.history[0])}));
});
test("old project exports remain compatible; new review fields and canonical history survive import",()=>{
  const entry={key:identity(pool[0]),status:"Review",strengths:"",concerns:"",note:"Example",evidenceUrl:""};
  const project={id:"test",name:"Example",brief,entries:[entry],datasetVersion:"test",createdAt:"2026-10-06T00:00:00Z"};
  assert.deepEqual(validateProject({schemaVersion:1,project}),project);
  const next={...project,entries:[recordDecision({...entry,reviewDate:"2026-10-10",nextAction:"Review video"},project.createdAt)]};
  assert.deepEqual(validateProject({schemaVersion:1,project:next}),next);
  assert.throws(()=>validateProject({schemaVersion:1,project:{...next,entries:[{...next.entries[0],history:[{...next.entries[0].history[0],status:"Unknown"}]}]}}));
});
test("cohort audits are deterministic and do not mutate statistics; singleton references remain unscorable",()=>{
  const before=JSON.stringify(pool),rows=auditCohort(pool,features);
  assert.equal(rows.length,pool.length);assert.ok(rows.every(r=>r.baselineSize===10));
  for(const r of rows)for(const k of ["priorRetention","featureRetention","weightRetention"])assert.ok(r[k]===null||(r[k]>=0&&r[k]<=100));
  assert.deepEqual(rows,auditCohort(pool,features));assert.equal(JSON.stringify(pool),before);
  assert.equal(auditCohort([pool[0]],features)[0].priorRetention,null);
  const incomplete=auditCohort([player(1,{goals_p90:undefined}),...pool.slice(1)],features);assert.equal(incomplete[0].baselineSize,0);
  const group=summarizeAudit(incomplete)[0];assert.equal(group.tested,13);assert.equal(group.profiles,14);
});
test("whole-dataset audit separates positions/seasons, reports progress and refuses partial cancelled results",async()=>{
  const progress=[];const rows=[...pool,...pool.map(p=>({...p,season:"Demo 01"})),player(100,{position:"Defender"})];
  const result=await auditDataset(rows,features,{onProgress:(done,total)=>progress.push([done,total])});
  assert.equal(result.cohorts,3);assert.equal(result.profiles,29);assert.equal(result.tested,28);assert.deepEqual(progress.at(-1),[3,3]);
  assert.ok(result.rows.every(r=>r.cohortSize===14||r.cohortSize===1));
  await assert.rejects(auditDataset(rows,features,{cancelled:()=>true}),/cancelled/);
  const lookup=buildPercentiles(pool,features);assert.ok(lookup[identity(pool[0])]);
});
test("optimized dataset audit agrees with the existing selected-player diagnostic formula",()=>{
  const rows=auditCohort(pool,features);
  for(let i=0;i<pool.length;i++){
    const diagnostic=rankingDiagnostics(pool,pool[i],features);
    assert.equal(rows[i].priorRetention,Math.min(...diagnostic.priors.filter(p=>p.prior!==900).map(p=>p.retained)));
    assert.equal(rows[i].featureRetention,Math.min(...diagnostic.ablations.map(p=>p.retained)));
  }
});
