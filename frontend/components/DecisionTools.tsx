"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { assessBrief, auditDataset, briefReasons, buildPercentiles, evidenceSummary, identity, labels, localDate, observed, percentile, recordDecision, safeEvidenceUrl } from "../lib/recruitment";
import type { AuditPlayer, Percentiles, ProjectEntry, RecruitmentBrief, RecruitmentProject, ScoutPlayer } from "../lib/recruitment";

const format = (value: number | null, unit = "percentile") => value === null ? "Unavailable" : `${value.toFixed(unit === "percentile" ? 1 : 2)} ${unit === "percentile" ? "pct" : "/90"}`;
const palette = ["#ff2d8d", "#62ad28", "#00a4c6", "#be8900"];
function saveFile(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], {type:"application/json"}));
  const link = document.createElement("a"); link.href=url; link.download=name; link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function EvidencePanel({player,features,generatedAt,compact=false}:{player:ScoutPlayer;features:string[];generatedAt?:string;compact?:boolean}) {
  const e = evidenceSummary(player,features,generatedAt);
  return <div className={`decision-evidence ${compact?"compact":""}`} aria-label={`Evidence strength for ${player.player_name}`}>
    <div><span>Sample</span><strong>{e.sample}</strong><small>{e.minutes?.toLocaleString()??"Unknown"} minutes</small></div>
    <div><span>Metric coverage</span><strong>{e.available}/{e.total} available</strong><small>{e.missing.length?`Missing: ${e.missing.map(f=>labels[f]).join(", ")}`:"Supplied metrics only; not full football coverage"}</small></div>
    <div><span>Source freshness</span><strong>{e.exportLabel}</strong><small>{generatedAt?.slice(0,10)??"Date not supplied"} · {e.source}</small></div>
    {!compact&&<div><span>Performance freshness</span><strong>{e.matchDate?`Last match: ${e.matchDate}`:"Latest match date unverified"}</strong><small>{e.contextDate?`Squad context dated ${e.contextDate}; separate from performance coverage.`:"An export date does not establish how current the underlying matches are."}</small></div>}
  </div>;
}

export function NearMisses({pool,target,brief,lookup,onReport,onAdd,features,generatedAt}:{pool:ScoutPlayer[];target:ScoutPlayer;brief:RecruitmentBrief;lookup:Percentiles;onReport:(p:ScoutPlayer)=>void;onAdd:(p:ScoutPlayer)=>void;features:string[];generatedAt?:string}) {
  const excluded = useMemo(()=>pool.filter(p=>identity(p)!==identity(target)).map(player=>({player,...briefReasons(player,brief,lookup)})).filter(r=>!r.assessment.eligible),[pool,target,brief,lookup]);
  const near = excluded.filter(r=>!r.unknown).sort((a,b)=>a.mandatoryMisses-b.mandatoryMisses||a.gap-b.gap||identity(a.player).localeCompare(identity(b.player))).slice(0,6);
  const unknown = excluded.filter(r=>r.unknown);
  return <section className="decision-section"><span className="eyebrow">Trade-offs, made visible</span><h3>Why these players missed the brief</h3>
    <p className="desk-footnote">Closest measured misses first: number of mandatory misses, then normalized threshold gaps. This is a search aid, not a player-quality ranking. Preferences do not exclude anyone.</p>
    <div className="decision-near-grid">{near.map(r=><article key={identity(r.player)}><strong>{r.player.player_name}</strong><small>{r.player.club} · {r.player.season}</small><ul>{r.reasons.filter(x=>x.mandatory).map((reason,i)=><li key={i}>{reason.text}</li>)}</ul>
      <p className="desk-footnote">{r.assessment.checks.filter(c=>c.met).length}/{r.assessment.checks.length} metric targets met · {r.mandatoryMisses} mandatory misses</p>
      <EvidencePanel compact player={r.player} features={features} generatedAt={generatedAt}/><div className="desk-toolbar"><button onClick={()=>onReport(r.player)}>Inspect near-miss report</button><button onClick={()=>onAdd(r.player)}>+ Project</button></div></article>)}</div>
    {!near.length&&<p className="desk-footnote">No measured near-misses in this cohort.</p>}
    {unknown.length>0&&<details><summary>{unknown.length} excluded profiles have unverified mandatory evidence</summary><ul>{unknown.map(r=><li key={identity(r.player)}><strong>{r.player.player_name}</strong>: {r.reasons.filter(x=>x.mandatory).map(x=>x.text).join("; ")}</li>)}</ul></details>}
  </section>;
}

type DecisionCompareProps = {pool:ScoutPlayer[];brief:RecruitmentBrief;lookup:Percentiles;selected:string[];onSelected:(keys:string[])=>void;features:string[];generatedAt?:string;onReport:(p:ScoutPlayer)=>void;onDossier:(players:ScoutPlayer[])=>void};
export function BriefDecisionCompare(props:DecisionCompareProps) {
  const {pool,brief,lookup,selected,onSelected,features,generatedAt,onReport,onDossier}=props;
  const [add,setAdd]=useState("");
  const rows=selected.map(k=>pool.find(p=>identity(p)===k)).filter((p):p is ScoutPlayer=>Boolean(p)).slice(0,4);
  useEffect(()=>{setAdd("");},[brief.position,brief.season]);
  const ranked=pool.map(p=>({p,a:assessBrief(p,brief,lookup)})).sort((a,b)=>Number(b.a.eligible)-Number(a.a.eligible)||(b.a.score??-1)-(a.a.score??-1)||identity(a.p).localeCompare(identity(b.p)));
  return <>
    <div className="desk-report-head"><span className="eyebrow">Your requirements · their evidence</span><h3>Compare candidates against {brief.name}</h3><p>{brief.position} · {brief.season} · {brief.minimumMinutes}+ minutes · {pool.length} cohort profiles</p></div>
    <div className="desk-toolbar"><button disabled={!rows.length} onClick={()=>onDossier(rows)}>Preview comparison dossier</button><span>Includes your search, charts and saved notes.</span></div>
    <details className="flow-advanced" open={!rows.length}><summary>Add or change players <span>Choose manually or try four leading matches</span></summary><div className="desk-toolbar"><label>Add candidate<select aria-label="Add brief comparison candidate" value={add} onChange={e=>setAdd(e.target.value)}><option value="">Choose a player</option>{pool.filter(p=>!selected.includes(identity(p))).map(p=><option key={identity(p)} value={identity(p)}>{p.player_name}</option>)}</select></label>
      <button disabled={!add||rows.length>=4} onClick={()=>{onSelected([...rows.map(identity),add]);setAdd("");}}>Add to comparison</button>
      <button disabled={!pool.length} onClick={()=>onSelected(ranked.slice(0,4).map(r=>identity(r.p)))}>Use four leading candidates</button></div></details>
    <p className="desk-footnote">Compare the same search targets for every player. Missing a preferred target does not rule a player out.</p>
    <div className="desk-chips">{rows.map((p,i)=><span key={identity(p)} style={{borderColor:palette[i]}}>{p.player_name}<button aria-label={`Remove brief comparison ${p.player_name}`} onClick={()=>onSelected(rows.filter(r=>identity(r)!==identity(p)).map(identity))}>×</button></span>)}</div>
    {!rows.length?<p className="desk-empty">Choose candidates above to make the trade-offs visible.</p>:<>
      <div className="flow-comparison-cards">{rows.map((p,i)=>{const a=assessBrief(p,brief,lookup);return <article key={identity(p)} style={{borderTopColor:palette[i]}}><h4>{p.player_name}</h4><p>{p.club} · {observed(p,"minutes")?.toLocaleString()??"Unknown"} minutes</p><strong className={a.eligible?"desk-pass":"desk-warning"}>{a.eligible?"✓ Required targets met":"Required target missed / unknown"}</strong><div className="flow-status-list"><div><span>Playing time <small>Required</small></span><b className={observed(p,"minutes")===null?"unknown":(p.minutes??0)>=brief.minimumMinutes?"met":"missed"}>{observed(p,"minutes")===null?"Unknown":(p.minutes??0)>=brief.minimumMinutes?"Met":"Missed"}</b></div>{a.checks.map(c=><div key={c.feature}><span>{labels[c.feature]} <small>{c.required?"Required":"Preferred"}</small></span><b className={c.value===null?"unknown":c.met?"met":"missed"}>{c.value===null?"Unknown":c.met?"Met":"Missed"}</b></div>)}</div><button onClick={()=>onReport(p)}>View player →</button><details className="flow-evidence"><summary>Sample & source details</summary><EvidencePanel player={p} features={features} generatedAt={generatedAt}/></details></article>;})}</div>
      <details className="flow-advanced"><summary>Compare exact numbers <span>Threshold margins & target attainment</span></summary><div className="desk-table-scroll"><table className="decision-matrix"><caption>Requirement evidence and margins</caption><thead><tr><th>Requirement</th>{rows.map(p=><th key={identity(p)}>{p.player_name}</th>)}</tr></thead><tbody>
        <tr><th>Eligibility</th>{rows.map(p=><td key={identity(p)} className={assessBrief(p,brief,lookup).eligible?"desk-pass":"desk-warning"}>{assessBrief(p,brief,lookup).eligible?"Mandatory requirements met":"Excluded by mandatory evidence"}</td>)}</tr>
        <tr><th>Minimum minutes: {brief.minimumMinutes}</th>{rows.map(p=><td key={identity(p)}>{observed(p,"minutes")?.toLocaleString()??"Unavailable"}<small>{observed(p,"minutes")===null?"Cannot verify":`${(p.minutes??0)-brief.minimumMinutes>=0?"+":""}${(p.minutes??0)-brief.minimumMinutes} minutes`}</small></td>)}</tr>
        {brief.rules.map(rule=><tr key={rule.feature}><th>{labels[rule.feature]}<small>{rule.required?"Mandatory":"Preference"} · ≥ {rule.minimum} {rule.unit==="percentile"?"pct":"/90"} · weight {rule.weight}</small></th>{rows.map(p=>{
          const c=assessBrief(p,brief,lookup).checks.find(c=>c.feature===rule.feature)!;
          const gap=c.value===null?null:c.value-rule.minimum;
          return <td key={identity(p)} className={c.met?"desk-pass":rule.required?"desk-warning":"decision-preference"}>{format(c.value,rule.unit)}<small>{gap===null?"Unverified":`${gap>=0?"+":""}${gap.toFixed(rule.unit==="percentile"?1:2)} ${rule.unit==="percentile"?"points":"/90"} · ${c.met?"met":"missed"}`}</small></td>;
        })}</tr>)}
        <tr><th>Weighted attainment<small>Threshold attainment, not quality</small></th>{rows.map(p=><td key={identity(p)}>{assessBrief(p,brief,lookup).score?.toFixed(1)??"Not scored"}</td>)}</tr>
      </tbody></table></div></details>
    </>}
  </>;
}

export function ProjectReview({entry,onUpdate,onNotice}:{entry:ProjectEntry;onUpdate:(value:Partial<ProjectEntry>)=>void;onNotice:(text:string)=>void}) {
  const due=entry.reviewDate && entry.reviewDate<=localDate();
  return <section className="decision-review"><div className="desk-entry-grid"><label>Next action<textarea maxLength={5000} value={entry.nextAction??""} onChange={e=>onUpdate({nextAction:e.target.value})} placeholder="e.g. Watch three full matches and review off-ball work"/></label>
    <label>Review date<input type="date" value={entry.reviewDate??""} onInput={e=>onUpdate({reviewDate:e.currentTarget.value})} onChange={e=>onUpdate({reviewDate:e.target.value})}/>{due&&<small className="desk-warning">{entry.reviewDate===localDate()?"Review due today":"Review overdue"}</small>}</label></div>
    <div className="desk-toolbar"><button disabled={(entry.history?.length??0)>=100} onClick={()=>{try{const updated=recordDecision(entry);onUpdate({history:updated.history});onNotice("Decision recorded with the current stage, notes, next action and review date.");}catch(error){onNotice(error instanceof Error?error.message:"Decision could not be recorded.");}}}>Record decision</button><span>{entry.history?.length??0} recorded decisions · field edits save automatically; history changes only when recorded</span></div>
    <details><summary>Decision history</summary>{!entry.history?.length?<p className="desk-footnote">No recorded decisions yet. Add your reasoning, then record a checkpoint.</p>:<ol className="decision-timeline">{entry.history.slice().reverse().map((h,i)=><li key={`${h.at}-${i}`}><strong>{h.status} · {new Date(h.at).toLocaleString()}</strong><p>{h.note||"No decision note supplied"}</p><small>Next: {h.nextAction||"Not specified"} · review: {h.reviewDate||"Not scheduled"}</small></li>)}</ol>}</details>
  </section>;
}

export function DatasetAudit({players,features,datasetVersion}:{players:ScoutPlayer[];features:string[];datasetVersion:string}) {
  const [result,setResult]=useState<Awaited<ReturnType<typeof auditDataset>>|null>(null);
  const [completedAt,setCompletedAt]=useState("");
  const [running,setRunning]=useState(false),[progress,setProgress]=useState(""),[error,setError]=useState("");
  const [position,setPosition]=useState("All"),[season,setSeason]=useState("All");
  const cancel=useRef(false), mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;cancel.current=true;};},[]);
  async function run() {
    cancel.current=false;setRunning(true);setError("");setResult(null);setProgress("Preparing cohorts…");
    try {
      const audit=await auditDataset(players,features,{cancelled:()=>cancel.current,onProgress:(done,total)=>{if(mounted.current)setProgress(`${done}/${total} cohorts checked`);},yieldTask:()=>new Promise(resolve=>window.setTimeout(resolve,0))});
      if(mounted.current){setResult(audit);setCompletedAt(new Date().toISOString());}
    } catch(e) {if(mounted.current)setError(e instanceof Error?e.message:"Audit failed.");}
    finally {if(mounted.current)setRunning(false);}
  }
  const filtered=result?.groups.filter(g=>(position==="All"||g.position===position)&&(season==="All"||g.season===season))??[];
  const sensitive=(result?.rows??[]).filter(r=>r.baselineSize>0&&(position==="All"||r.position===position)&&(season==="All"||r.season===season)).sort((a,b)=>Math.min(a.priorRetention??100,a.featureRetention??100,a.weightRetention??100)-Math.min(b.priorRetention??100,b.featureRetention??100,b.weightRetention??100)||a.key.localeCompare(b.key)).slice(0,12);
  const pct=(n:number|null)=>n===null?"Unavailable":`${n.toFixed(1)}%`;
  return <section className="decision-section"><span className="eyebrow">Beyond one reference player</span><h3>Whole-dataset ranking audit</h3>
    <p className="desk-footnote">Every imported player-season is tested inside its own position/season cohort under three alternative minutes priors, one-feature removals and three category-weight presets. Baseline: balanced position weights, 900-minute prior, top 10. Dashboard priorities do not alter this audit.</p>
    <div className="desk-toolbar"><button disabled={running} onClick={()=>void run()}>Run whole-dataset audit</button>{running&&<button onClick={()=>{cancel.current=true;}}>Cancel audit</button>}<span role="status">{running?progress:result?`${result.tested}/${result.profiles} profiles tested across ${result.cohorts} cohorts`:error||"Not run yet; no provider requests are made"}</span>
      {result&&<button onClick={()=>saveFile("scoutlab-ranking-audit.json",JSON.stringify({schemaVersion:1,datasetVersion,completedAt,exportedAt:new Date().toISOString(),baseline:"Balanced position weights, 900-minute prior; within-season/position top-set overlap",scenarios:{priors:[0,450,1800],featureRemoval:features,weightPresets:[{name:"Goal threat",Finishing:160,Creation:65,Involvement:65},{name:"Chance creation",Finishing:65,Creation:160,Involvement:65},{name:"Link play",Finishing:65,Creation:80,Involvement:160}]},...result},null,2))}>Export full ranking audit</button>}</div>
    {result&&<><div className="desk-toolbar"><label>Audit position<select aria-label="Audit position" value={position} onChange={e=>setPosition(e.target.value)}><option>All</option>{[...new Set(players.map(p=>p.position))].sort().map(p=><option key={p}>{p}</option>)}</select></label><label>Audit season<select aria-label="Audit season" value={season} onChange={e=>setSeason(e.target.value)}><option>All</option>{[...new Set(players.map(p=>p.season??"Unspecified"))].sort().map(s=><option key={s}>{s}</option>)}</select></label></div>
      <p className="desk-footnote">Group percentages average each tested player's worst-case top-set retention within the scenario family. Unscorable references are excluded from averages and counted separately. Low retention means sensitivity, not poor ability. Small pools can appear stable simply because there are few alternatives.</p>
      <div className="desk-table-scroll"><table><thead><tr><th>Position / season</th><th>Sample band</th><th>Tested / total</th><th>Short top-10 sets<small>Includes unscorable references</small></th><th>Prior retention</th><th>Feature retention</th><th>Weight retention</th></tr></thead><tbody>{filtered.map(g=><tr key={`${g.position}-${g.season}-${g.sample}`}><th>{g.position}<small>{g.season}</small></th><td>{g.sample}</td><td>{g.tested}/{g.profiles}</td><td>{g.thinCohortProfiles}</td><td>{pct(g.priorRetention)}</td><td>{pct(g.featureRetention)}</td><td>{pct(g.weightRetention)}</td></tr>)}</tbody></table></div>
      <h4>References most sensitive to a tested change</h4><div className="desk-table-scroll"><table><thead><tr><th>Player / season</th><th>Sample</th><th>Prior</th><th>Feature removal</th><th>Weight preset</th><th>Most sensitive removal</th></tr></thead><tbody>{sensitive.map((r:AuditPlayer)=><tr key={r.key}><th>{r.name}<small>{r.position} · {r.season}</small></th><td>{r.sample}</td><td>{pct(r.priorRetention)}</td><td>{pct(r.featureRetention)}</td><td>{pct(r.weightRetention)}</td><td>{r.mostSensitiveFeature?labels[r.mostSensitiveFeature]:"Unavailable"}</td></tr>)}</tbody></table></div>
      <p className="desk-footnote">This is a descriptive ranking audit, not out-of-time accuracy validation or a transfer-success model. Defensive cohorts still use the supplied attacking features; stability cannot compensate for missing defensive evidence.</p></>}
  </section>;
}

export function Dossier({players,allPlayers,brief,lookup,features,project,datasetVersion,generatedAt,onClose}:{players:ScoutPlayer[];allPlayers:ScoutPlayer[];brief:RecruitmentBrief;lookup:Percentiles;features:string[];project?:RecruitmentProject;datasetVersion:string;generatedAt?:string;onClose:()=>void}) {
  const closeRef=useRef<HTMLButtonElement>(null), rootRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null, overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";closeRef.current?.focus();
    const keyboard=(e:KeyboardEvent)=>{
      if(e.key==="Escape"){onClose();return;}
      if(e.key!=="Tab")return;
      const focusable=rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
      if(!focusable?.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",keyboard);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",keyboard);previous?.focus();};
  },[onClose]);
  return createPortal(<div className="scout-dossier" ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="dossier-title"><div className="dossier-controls"><button ref={closeRef} onClick={onClose}>Close dossier</button><button onClick={()=>window.print()}>Print / Save as PDF</button><span>Use your browser's print destination to save a PDF. No upload or external service.</span></div>
    <main className="dossier-paper"><header><span>SCOUT//LAB · RECRUITMENT DOSSIER</span><h1 id="dossier-title">{brief.name}</h1><p>{brief.position} · {brief.season} · {brief.minimumMinutes}+ minutes</p><p>Dataset {datasetVersion} · exported {generatedAt?.slice(0,10)??"date unavailable"} · dossier prepared {localDate()}</p></header>
      <section><h2>The brief</h2><table><thead><tr><th>Metric</th><th>Minimum</th><th>Requirement</th><th>Weight</th></tr></thead><tbody>{brief.rules.map(r=><tr key={r.feature}><td>{labels[r.feature]}</td><td>{r.minimum} {r.unit==="percentile"?"pct":"/90"}</td><td>{r.required?"Mandatory":"Preference"}</td><td>{r.weight}</td></tr>)}</tbody></table>{!brief.rules.length&&<p>No metric requirements configured.</p>}</section>
      <section><h2>Selected candidate comparison</h2><table><thead><tr><th>Requirement</th>{players.map(p=><th key={identity(p)}>{p.player_name}</th>)}</tr></thead><tbody><tr><th>Minutes</th>{players.map(p=><td key={identity(p)}>{p.minutes?.toLocaleString()??"Unavailable"}</td>)}</tr><tr><th>Mandatory evidence</th>{players.map(p=><td key={identity(p)}>{assessBrief(p,brief,lookup).eligible?"Met":"Not met"}</td>)}</tr>{brief.rules.map(r=><tr key={r.feature}><th>{labels[r.feature]}</th>{players.map(p=>{const c=assessBrief(p,brief,lookup).checks.find(c=>c.feature===r.feature)!;return <td key={identity(p)}>{format(c.value,r.unit)}<br/>{c.met?"Met":r.required?"Mandatory miss":"Preference miss"}</td>;})}</tr>)}</tbody></table>
        <h3>Sample-adjusted metric profiles</h3><p>Percentiles in each candidate's position/season cohort, 900-minute prior. Bars are not player-quality grades.</p>
        <svg role="img" aria-label="Candidate percentile comparison chart" viewBox={`0 0 800 ${90+features.length*92}`} className="dossier-chart"><rect width="800" height={90+features.length*92} fill="white"/>{players.map((p,i)=><text key={identity(p)} x={10+(i%2)*390} y={20+Math.floor(i/2)*25} fill={palette[i]} fontSize="15">{p.player_name}</text>)}{features.map((f,j)=><g key={f}><text x="10" y={90+j*92} fontSize="13" fill="#222">{labels[f]}</text>{players.map((p,i)=>{const value=percentile(p,f,lookup);return <g key={identity(p)}><rect x="180" y={78+j*92+i*16} width={(value??0)*5.3} height="10" rx="3" fill={palette[i]}/><text x="730" y={88+j*92+i*16} fontSize="11" fill="#222">{value?.toFixed(1)??"N/A"}</text></g>;})}</g>)}</svg>
      </section>
      {players.map(p=>{const evidence=evidenceSummary(p,features,generatedAt),reasons=briefReasons(p,brief,lookup);return <section className="dossier-candidate" key={identity(p)}><h2>{p.player_name}</h2><p>{p.club} · {p.position} · {p.season}</p><p>{evidence.sample} · {evidence.minutes?.toLocaleString()??"Unknown"} minutes · {evidence.available}/{evidence.total} supplied metrics available</p><p>{evidence.exportLabel} · {evidence.source}. {evidence.matchDate?`Latest match date supplied: ${evidence.matchDate}.`:"Latest performance match date is unverified."}</p><h3>Requirement trade-offs</h3>{reasons.reasons.length?<ul>{reasons.reasons.map((r,i)=><li key={i}>{r.text} ({r.mandatory?"mandatory":"preference"})</li>)}</ul>:<p>All configured requirements and preferences met.</p>}<table><thead><tr><th>Metric</th><th>Recorded /90</th><th>Adjusted percentile</th></tr></thead><tbody>{features.map(f=><tr key={f}><td>{labels[f]}</td><td>{observed(p,f)?.toFixed(2)??"Unavailable"}</td><td>{percentile(p,f,lookup)?.toFixed(1)??"Unavailable"}</td></tr>)}</tbody></table></section>;})}
      {project&&<section className="dossier-project"><h2>Project review notes · {project.name}</h2><p>All {project.entries.length} project candidates; the chart above covers only the selected comparison. Project snapshot: {project.datasetVersion}.</p>{project.entries.map(e=>{const p=allPlayers.find(p=>identity(p)===e.key);return <article key={e.key}><h3>{p?.player_name??`Unavailable profile: ${e.key}`} · {e.status}</h3><p><strong>Strengths:</strong> {e.strengths||"Not recorded"}</p><p><strong>Concerns:</strong> {e.concerns||"Not recorded"}</p><p><strong>Decision notes:</strong> {e.note||"Not recorded"}</p><p><strong>Next action:</strong> {e.nextAction||"Not specified"} · <strong>Review:</strong> {e.reviewDate||"Not scheduled"}</p>{safeEvidenceUrl(e.evidenceUrl)&&<p><strong>Evidence:</strong> <a href={safeEvidenceUrl(e.evidenceUrl)!} target="_blank" rel="noreferrer">{e.evidenceUrl}</a></p>}{e.observations?.length?<div><h4>Manual match observations · separate from measured statistics</h4>{e.observations.map(o=><article key={o.id}><strong>{o.category} · {o.outcome}</strong><p>{o.date} · vs {o.opponent} · {o.role}{o.timestamp?` · ${o.timestamp}`:""}</p><p style={{whiteSpace:"pre-wrap"}}>{o.note}</p>{safeEvidenceUrl(o.evidenceUrl)&&<a href={safeEvidenceUrl(o.evidenceUrl)!} target="_blank" rel="noreferrer">Observation evidence: {o.evidenceUrl}</a>}</article>)}</div>:null}{e.history?.length?<details open><summary>Recorded decisions</summary><ol>{e.history.map((h,i)=><li key={`${h.at}-${i}`}><strong>{h.at} · {h.status}</strong><p>{h.note||"No note"}</p><p>Next: {h.nextAction||"None"} · review {h.reviewDate||"Not scheduled"}</p></li>)}</ol></details>:null}</article>;})}</section>}
      <footer><h2>Before a recruitment decision</h2><p>Attacking and creative metrics only. Defensive work, physical attributes, pressing, off-ball responsibilities and tactical transferability are not established here. Review full-match video, team context, role and opposition. Similarity and threshold attainment are not predictions of recruitment success.</p><p>Sample adjustment does not fix missing data. Export timestamps are not proof of live match coverage. This dossier uses the imported snapshot and performs no paid API or AI requests.</p></footer>
    </main>
  </div>,document.body);
}
