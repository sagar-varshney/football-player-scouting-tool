import test from "node:test";
import assert from "node:assert/strict";
import { buildPercentiles, measuredSummary, profileSignature, reviewReasons, validateObservation, validateProject } from "../lib/recruitment.ts";
import { validateLens } from "../lib/lenses.ts";
const player={player_id:1,player_name:"Example",club:"Club",position:"Winger",season:"Demo 02",minutes:1800,archetype:"Fixture",cluster:0,xg_p90:.4,xa_p90:.2};
const features=["xg_p90","xa_p90"];
const brief={name:"Test",position:"Winger",season:"Demo 02",minimumMinutes:900,rules:[{feature:"xa_p90",minimum:.3,unit:"per90",required:true,weight:100}]};
const observation={id:"test-1",date:"2026-10-07",opponent:"Opponent",role:"Right winger",category:"Tracking runners",outcome:"Not observed",timestamp:"34:20",note:"No relevant sequence in the viewed segment.",evidenceUrl:"https://example.org/match"};
const entry={key:"example",status:"Review",strengths:"",concerns:"",note:"",evidenceUrl:"",observations:[observation]};
test("summaries expose numerical evidence and distinguish unknown from zero",()=>{
  const pool=[player,{...player,player_id:2,player_name:"Other",xg_p90:.1,xa_p90:0}];
  const summary=measuredSummary(player,features,buildPercentiles(pool,features),brief);
  assert.match(summary.findings[0].evidence,/Recorded/);assert.equal(summary.gaps.length,1);assert.match(summary.gaps[0].title,/required target/);
  const missing=measuredSummary({...player,xa_p90:undefined},features,{},brief);assert.match(missing.gaps[0].title,/cannot be verified/);assert.deepEqual(missing.missing,["xa_p90"]);
  const single=measuredSummary(player,features,buildPercentiles([player],features),brief);assert.equal(single.findings.length,0);
});
test("observations validate dates, links, outcomes and preserve project round trips",()=>{
  assert.deepEqual(validateObservation(observation),observation);
  for(const change of [{date:"2026-02-30"},{evidenceUrl:"javascript:alert(1)"},{outcome:"Predicted"},{note:""}])assert.throws(()=>validateObservation({...observation,...change}));
  const project={id:"p",name:"Test",brief,entries:[entry],datasetVersion:"old",createdAt:"2026-10-07T00:00:00Z"};
  assert.deepEqual(validateProject({schemaVersion:1,project}).entries[0].observations,[observation]);
  assert.throws(()=>validateProject({schemaVersion:1,project:{...project,entries:[{...entry,observations:[observation,observation]}]}}));
});
test("review inbox distinguishes deadlines, observed evidence and changed imports",()=>{
  const signature=profileSignature(player,features);assert.equal(signature,profileSignature(player,features.slice().reverse()));
  assert.notEqual(signature,profileSignature({...player,xg_p90:.6},features));
  const current={...entry,reviewDate:"2026-10-06",profileSignature:signature};
  assert.deepEqual(reviewReasons(current,player,features,"old","new","2026-10-07"),["Review overdue","Awaiting a match observation"]);
  assert.ok(reviewReasons(current,{...player,minutes:2000},features,"old","new","2026-10-07").includes("Imported record changed"));
  assert.equal(reviewReasons({...current,observations:[{...observation,outcome:"Observed"}]},player,features,"old","new","2026-10-07").length,1);
  assert.deepEqual(reviewReasons({...current,status:"Passed"},undefined,features,"old","new","2026-10-07"),[]);
  assert.ok(reviewReasons(entry,player,features,"old","new","2026-10-07").includes("Dataset changed; record needs checking"));
});
test("lenses reject unsupported metrics and all-zero priorities",()=>{
  const lens={id:"lens",name:"Creation",position:"Winger",metrics:features,x:"xg_p90",y:"xa_p90",distribution:"xa_p90",basis:"percentile",reference:true,priorities:{Finishing:80,Creation:140,Involvement:80}};
  assert.deepEqual(validateLens(lens,features),lens);
  for(const change of [{metrics:[]},{metrics:["tackles_p90"]},{metrics:["xg_p90","xg_p90"]},{x:"unsupported"},{priorities:{Finishing:0,Creation:0,Involvement:0}},{basis:"rating"}])assert.throws(()=>validateLens({...lens,...change},features));
});
