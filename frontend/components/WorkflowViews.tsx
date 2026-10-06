"use client";

import { useState } from "react";
import { EvidencePanel } from "./DecisionTools";
import { assessBrief, briefReasons, evidenceSummary, identity, labels, observed } from "../lib/recruitment";
import { presetBrief, requirementLabel, searchPresets } from "../lib/workflow";
import type { Percentiles, RecruitmentBrief, ScoutPlayer } from "../lib/recruitment";

export function SearchPresets({brief,features,onChange}:{brief:RecruitmentBrief;features:string[];onChange:(brief:RecruitmentBrief)=>void}) {
  return <div className="flow-presets" aria-label="Search starting points">{searchPresets.map(p=>{
    const next=presetBrief(brief,p.id,features);
    const selected=JSON.stringify(brief.rules)===JSON.stringify(next.rules);
    return <button key={p.id} type="button" aria-pressed={selected} disabled={!p.metrics.some(f=>features.includes(f))} onClick={()=>onChange(next)}><span>{p.id==="creative"?"↗":p.id==="scoring"?"◎":"↔"}</span><strong>{p.name}</strong><small>{p.description}</small><b>{selected?"Selected":"Use this search →"}</b></button>;
  })}</div>;
}

type Candidate = {player:ScoutPlayer;assessment:ReturnType<typeof assessBrief>;similarity:number|null};
export function CandidateCards({candidates,brief,lookup,features,generatedAt,selected,saved,onSelected,onSave,onReport}:{candidates:Candidate[];brief:RecruitmentBrief;lookup:Percentiles;features:string[];generatedAt?:string;selected:string[];saved:string[];onSelected:(keys:string[])=>void;onSave:(p:ScoutPlayer)=>void;onReport:(p:ScoutPlayer)=>void}) {
  const [query,setQuery]=useState("");
  const [limit,setLimit]=useState(6);
  const filtered=candidates.filter(({player:p})=>`${p.player_name} ${p.club}`.toLowerCase().includes(query.toLowerCase().trim()));
  const visible=filtered.slice(0,limit);
  return <>
    <div className="flow-results-bar"><label>Find a candidate<input type="search" placeholder="Search name or club" value={query} onChange={e=>{setQuery(e.target.value);setLimit(6);}}/></label><p><strong>{filtered.length}</strong> {filtered.length===1?"candidate":"candidates"} <span>· matches your current filters</span></p></div>
    <div className="flow-candidate-grid">{visible.map(({player:p,assessment:a,similarity})=>{
      const key=identity(p), chosen=selected.includes(key), isSaved=saved.includes(key), evidence=evidenceSummary(p,features,generatedAt);
      const met=a.checks.filter(c=>c.met).slice(0,2);
      const reasons=briefReasons(p,brief,lookup).reasons;
      const tradeoff=reasons.find(r=>r.mandatory)??reasons[0];
      return <article className={`flow-candidate ${chosen?"is-selected":""}`} key={key}>
        <header><div className="flow-avatar" aria-hidden="true">{p.player_name.split(" ").map(s=>s[0]).slice(0,2).join("")}</div><div><h4>{p.player_name}</h4><p>{p.club} · {p.position}</p></div><label className="flow-select"><input type="checkbox" aria-label={`Compare ${p.player_name}`} checked={chosen} disabled={!chosen&&selected.length>=4} onChange={()=>onSelected(chosen?selected.filter(k=>k!==key):[...selected,key])}/><span>Compare</span></label></header>
        <div className={`flow-fit ${a.eligible?"met":"missed"}`}>{a.eligible?"✓ Required targets met":"! A required target is missed or unknown"}</div>
        <div className="flow-reason"><span>Why consider them</span><p>{met.length?met.map(c=>`${labels[c.feature]} meets your target`).join(" · "):brief.rules.length?"No metric targets met yet. Open the details to review the gaps.":"No metric targets configured. Fine-tune your search to define a fit."}</p></div>
        <div className="flow-reason"><span>Main trade-off</span><p>{tradeoff?.text??"All search targets met. Tactical fit still needs a video review."}</p></div>
        <p className="flow-sample">{evidence.sample} · {evidence.minutes?.toLocaleString()??"Unknown"} minutes{evidence.missing.length?` · ${evidence.missing.length} missing metrics`:""}</p>
        <details className="flow-evidence"><summary>Targets & data details</summary><div className="flow-status-list">{a.checks.map(c=><div key={c.feature}><span>{labels[c.feature]} <small>{c.required?"Required":"Preferred"}</small></span><b className={c.value===null?"unknown":c.met?"met":"missed"}>{c.value===null?"Unknown":c.met?"Met":"Missed"}</b></div>)}</div><p className="desk-footnote">Target attainment: {a.score?.toFixed(1)??"unavailable"}/100 · similarity to the reference: {similarity?.toFixed(1)??"unavailable"}{similarity!==null?"%":""}. Neither is a player-quality rating.</p><ul>{a.gates.map(g=><li key={g}>{g}</li>)}{a.checks.map(c=><li key={c.feature}>{requirementLabel(labels[c.feature]??c.feature,c.met,c.value===null)} · {c.value?.toFixed(2)??"unavailable"} {c.unit==="per90"?"/90":"percentile"} · target {c.minimum}</li>)}</ul><EvidencePanel player={p} features={features} generatedAt={generatedAt}/></details>
        <footer><button className={isSaved?"flow-saved":"flow-primary"} disabled={isSaved} onClick={()=>onSave(p)}>{isSaved?"✓ Shortlisted":"+ Shortlist"}</button><button onClick={()=>onReport(p)}>View player →</button></footer>
      </article>;
    })}</div>
    {!visible.length&&<p className="desk-empty">{query?"No candidates match that name or club. Try another search.":"No players meet these targets. Edit your search or show near-misses to explore alternatives."}</p>}
    {filtered.length>limit&&<button className="flow-load" onClick={()=>setLimit(n=>n+6)}>Show 6 more candidates · {filtered.length-limit} remaining</button>}
  </>;
}
