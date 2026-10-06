export type ScoutPlayer = {
  player_id: number; player_name: string; club: string; position: string;
  season?: string; minutes?: number; archetype: string; cluster: number;
  [key: string]: number | string | undefined;
};
export type Percentiles = Record<string, Record<string, number>>;
export type BriefRule = { feature: string; minimum: number; unit: "percentile" | "per90"; required: boolean; weight: number };
export type RecruitmentBrief = { name: string; position: string; season: string; minimumMinutes: number; rules: BriefRule[] };
export type DecisionRecord = { at: string; status: ProjectEntry["status"]; note: string; nextAction: string; reviewDate: string };
export type MatchObservation = { id: string; date: string; opponent: string; role: string; category: "Positioning" | "Tracking runners" | "Receiving under pressure" | "Decision-making" | "Other"; outcome: "Observed" | "Not observed"; timestamp: string; note: string; evidenceUrl: string };
export type ProjectEntry = { key: string; status: "Longlist" | "Review" | "Priority" | "Passed"; strengths: string; concerns: string; note: string; evidenceUrl: string; reviewDate?: string; nextAction?: string; history?: DecisionRecord[]; observations?: MatchObservation[]; profileSignature?: string; reviewedDatasetVersion?: string };
export type RecruitmentProject = { id: string; name: string; brief: RecruitmentBrief; entries: ProjectEntry[]; datasetVersion: string; createdAt: string };
export const labels: Record<string, string> = { goals_p90: "Goals", xg_p90: "Expected goals", assists_p90: "Assists", xa_p90: "Expected assists", shots_p90: "Shots", key_passes_p90: "Key passes", xg_chain_p90: "Move involvement", xg_buildup_p90: "Buildup play" };
export const baseWeights: Record<string, Record<string, number>> = {
  Forward: { goals_p90: 1.5, xg_p90: 1.4, shots_p90: 1.2, assists_p90: .7, xa_p90: .6, key_passes_p90: .5, xg_chain_p90: .8, xg_buildup_p90: .4 },
  Winger: { goals_p90: 1, xg_p90: 1, shots_p90: 1.1, assists_p90: 1.1, xa_p90: 1.3, key_passes_p90: 1.4, xg_chain_p90: 1, xg_buildup_p90: .7 },
  Midfielder: { goals_p90: .5, xg_p90: .6, shots_p90: .6, assists_p90: .9, xa_p90: 1.3, key_passes_p90: 1.5, xg_chain_p90: 1.3, xg_buildup_p90: 1.4 },
  Defender: { goals_p90: .3, xg_p90: .4, shots_p90: .3, assists_p90: .5, xa_p90: .8, key_passes_p90: 1, xg_chain_p90: 1.3, xg_buildup_p90: 1.6 },
};
export function identity(p: ScoutPlayer) { return `${p.player_name}__${p.club}__${p.position}__${p.season ?? "single"}`; }
export function observed(p: ScoutPlayer, feature: string): number | null { const v = p[feature]; return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null; }
export function percentile(p: ScoutPlayer, feature: string, lookup: Percentiles): number | null { return lookup[identity(p)]?.[feature] ?? null; }
export function buildPercentiles(players: ScoutPlayer[], features: string[], prior = 900): Percentiles {
  const result: Percentiles = Object.fromEntries(players.map(p => [identity(p), {}]));
  for (const f of features) {
    const valid = players.filter(p => observed(p, f) !== null);
    if (valid.length < 2) continue;
    const mean = valid.reduce((s, p) => s + observed(p, f)!, 0) / valid.length;
    const adjusted = valid.map(p => { const m = Math.max(0, Number(p.minutes ?? 0)); return { key: identity(p), value: (observed(p, f)! * m + mean * prior) / (m + prior || 1) }; });
    const sorted = adjusted.map(p => p.value).sort((a, b) => a - b);
    for (const p of adjusted) { const first = sorted.indexOf(p.value); const last = sorted.lastIndexOf(p.value); result[p.key][f] = ((first + last) / 2) / (sorted.length - 1) * 100; }
  }
  return result;
}
export function weights(position: string, priorities: Record<string, number> = { Finishing: 100, Creation: 100, Involvement: 100 }): Record<string, number> {
  return Object.fromEntries(Object.entries(baseWeights[position] ?? {}).map(([f, w]) => [f, w * (priorities[["goals_p90", "xg_p90", "shots_p90"].includes(f) ? "Finishing" : ["assists_p90", "xa_p90", "key_passes_p90"].includes(f) ? "Creation" : "Involvement"] ?? 100) / 100]));
}
export function resemblance(a: ScoutPlayer, b: ScoutPlayer, features: string[], lookup: Percentiles, metricWeights = weights(a.position)): number | null {
  if (!features.length || a.position !== b.position || a.season !== b.season) return null;
  // Incomplete profiles are not silently compared on a different feature set.
  if (features.some(f => percentile(a, f, lookup) === null || percentile(b, f, lookup) === null)) return null;
  const total = features.reduce((s, f) => s + (metricWeights[f] ?? 1), 0);
  if (!total) return null;
  return features.reduce((s, f) => s + (100 - Math.abs(percentile(a, f, lookup)! - percentile(b, f, lookup)!)) * (metricWeights[f] ?? 1), 0) / total;
}
export function assessBrief(p: ScoutPlayer, brief: RecruitmentBrief, lookup: Percentiles) {
  const gates: string[] = [];
  if (p.position !== brief.position) gates.push("Different position");
  if (p.season !== brief.season) gates.push("Different season");
  const minutes = observed(p,"minutes");
  if (minutes === null) gates.push("Minutes unavailable; sample requirement cannot be verified");
  else if (minutes < brief.minimumMinutes) gates.push(`Below ${brief.minimumMinutes} minutes`);
  const checks = brief.rules.map(rule => {
    const value = rule.unit === "percentile" ? percentile(p, rule.feature, lookup) : observed(p, rule.feature);
    const met = value !== null && value >= rule.minimum;
    return { ...rule, value, met, attainment: value === null ? 0 : rule.minimum === 0 ? 100 : Math.min(100, value / rule.minimum * 100) };
  });
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const score = totalWeight ? checks.reduce((s, c) => s + c.attainment * c.weight, 0) / totalWeight : null;
  return { score, checks, eligible: gates.length === 0 && checks.every(c => !c.required || c.met), gates, metCount: checks.filter(c => c.met).length, unknownCount: checks.filter(c => c.value === null).length };
}
export function initialBrief(position: string, season: string, features: string[]): RecruitmentBrief {
  const selected = ["key_passes_p90", "xa_p90", "xg_p90"].filter(f => features.includes(f));
  return { name: "Chance creation brief", position, season, minimumMinutes: 900, rules: (selected.length ? selected : features.slice(0, 3)).map((feature, i) => ({ feature, minimum: i ? 60 : 75, unit: "percentile", required: i === 0, weight: i ? 30 : 40 })) };
}
export function safeEvidenceUrl(value: string): string | null { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
export function validateBrief(value: unknown): RecruitmentBrief {
  const b = value as RecruitmentBrief;
  if (!b || typeof b.name !== "string" || !b.name.trim() || b.name.length > 120 || !Object.hasOwn(baseWeights, b.position) || typeof b.season !== "string" || !b.season || b.season.length > 40 || !Number.isFinite(b.minimumMinutes) || b.minimumMinutes < 0 || b.minimumMinutes > 10000 || !Array.isArray(b.rules) || b.rules.length > 8) throw new Error("Invalid recruitment brief.");
  const seen = new Set<string>();
  for (const r of b.rules) {
    if (!r || !Object.hasOwn(labels, r.feature) || seen.has(r.feature) || !["percentile", "per90"].includes(r.unit) || typeof r.required !== "boolean" || !Number.isFinite(r.minimum) || r.minimum < 0 || r.minimum > (r.unit === "percentile" ? 100 : 1000) || !Number.isFinite(r.weight) || r.weight < 0 || r.weight > 100) throw new Error("Invalid or duplicate metric requirement.");
    seen.add(r.feature);
  }
  return { name: b.name.trim(), position: b.position, season: b.season, minimumMinutes: b.minimumMinutes, rules: b.rules.map(r => ({ feature: r.feature, minimum: r.minimum, unit: r.unit, required: r.required, weight: r.weight })) };
}
export function validateProject(value: unknown): RecruitmentProject {
  const envelope = value as { schemaVersion?: number; project?: RecruitmentProject };
  if (envelope?.schemaVersion !== 1 || !envelope.project) throw new Error("Choose a version 1 SCOUT//LAB project export.");
  const p = envelope.project;
  if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 120 || typeof p.datasetVersion !== "string" || p.datasetVersion.length > 200 || typeof p.createdAt !== "string" || !Number.isFinite(Date.parse(p.createdAt)) || !Array.isArray(p.entries) || p.entries.length > 64) throw new Error("Invalid project details or candidate limit exceeded.");
  const seen = new Set<string>();
  const entries = p.entries.map(e => {
    if (!e || typeof e.key !== "string" || !e.key || e.key.length > 500 || seen.has(e.key) || !["Longlist", "Review", "Priority", "Passed"].includes(e.status)) throw new Error("Invalid or duplicate project candidate.");
    for (const field of ["strengths", "concerns", "note", "evidenceUrl"] as const) if (typeof e[field] !== "string" || e[field].length > 5000) throw new Error("Invalid project notes.");
    if (e.evidenceUrl && !safeEvidenceUrl(e.evidenceUrl)) throw new Error("Evidence links must use http or https.");
    if (e.reviewDate !== undefined && (typeof e.reviewDate !== "string" || !validReviewDate(e.reviewDate))) throw new Error("Invalid review date.");
    if (e.nextAction !== undefined && (typeof e.nextAction !== "string" || e.nextAction.length > 5000)) throw new Error("Invalid next action.");
    if (e.history !== undefined && (!Array.isArray(e.history) || e.history.length > 100 || e.history.some(h => !h || typeof h.at !== "string" || !Number.isFinite(Date.parse(h.at)) || !["Longlist","Review","Priority","Passed"].includes(h.status) || typeof h.note !== "string" || h.note.length > 5000 || typeof h.nextAction !== "string" || h.nextAction.length > 5000 || typeof h.reviewDate !== "string" || !validReviewDate(h.reviewDate)))) throw new Error("Invalid decision history.");
    if(e.observations !== undefined && (!Array.isArray(e.observations) || e.observations.length > 100)) throw new Error("Invalid match observation list.");
    const observationIds = new Set<string>();
    const observations = e.observations?.map(o=>{const clean=validateObservation(o);if(observationIds.has(clean.id))throw new Error("Duplicate match observation.");observationIds.add(clean.id);return clean;});
    if(e.profileSignature !== undefined && (typeof e.profileSignature !== "string" || !/^v1-[0-9a-f]{8}$/.test(e.profileSignature))) throw new Error("Invalid profile signature.");
    if(e.reviewedDatasetVersion !== undefined && (typeof e.reviewedDatasetVersion !== "string" || e.reviewedDatasetVersion.length > 200)) throw new Error("Invalid reviewed dataset version.");
    seen.add(e.key); return { key: e.key, status: e.status, strengths: e.strengths, concerns: e.concerns, note: e.note, evidenceUrl: e.evidenceUrl,
      ...(e.reviewDate !== undefined ? { reviewDate: e.reviewDate } : {}), ...(e.nextAction !== undefined ? { nextAction: e.nextAction } : {}),
      ...(observations !== undefined ? { observations } : {}), ...(e.profileSignature !== undefined ? {profileSignature:e.profileSignature} : {}), ...(e.reviewedDatasetVersion !== undefined ? {reviewedDatasetVersion:e.reviewedDatasetVersion} : {}),
      ...(e.history !== undefined ? { history: e.history.map(h => ({ at:h.at,status:h.status,note:h.note,nextAction:h.nextAction,reviewDate:h.reviewDate })) } : {}) };
  });
  return { id: typeof p.id === "string" && /^[\w-]{1,100}$/.test(p.id) ? p.id : "imported", name: p.name.trim(), brief: validateBrief(p.brief), entries, datasetVersion: p.datasetVersion, createdAt: p.createdAt };
}

export function validReviewDate(value: string) {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
}
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}
export const observationCategories = ["Positioning","Tracking runners","Receiving under pressure","Decision-making","Other"] as const;
export function validateObservation(value: unknown): MatchObservation {
  const o=value as MatchObservation;
  if(!o || typeof o.id!=="string" || !/^[\w-]{1,100}$/.test(o.id) || typeof o.date!=="string" || !o.date || !validReviewDate(o.date) || !observationCategories.includes(o.category) || !["Observed","Not observed"].includes(o.outcome)) throw new Error("Check the match date and observation category.");
  for(const field of ["opponent","role","timestamp","note","evidenceUrl"] as const) if(typeof o[field]!=="string" || o[field].length>(field==="note"||field==="evidenceUrl"?5000:200))throw new Error("Invalid match observation fields.");
  if(!o.opponent.trim() || !o.role.trim() || !o.note.trim())throw new Error("Add an opponent, the player's role and an observation note.");
  if(o.evidenceUrl && !safeEvidenceUrl(o.evidenceUrl))throw new Error("Observation links must use http or https.");
  return {id:o.id,date:o.date,opponent:o.opponent.trim(),role:o.role.trim(),category:o.category,outcome:o.outcome,timestamp:o.timestamp.trim(),note:o.note.trim(),evidenceUrl:o.evidenceUrl};
}
// Change detector only, not a security hash or a copy of the underlying metrics.
export function profileSignature(p: ScoutPlayer, features: string[]) {
  const text=JSON.stringify([identity(p),observed(p,"minutes"),...features.slice().sort().map(f=>[f,observed(p,f)]),p.last_match_date??null]);
  let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return `v1-${(hash>>>0).toString(16).padStart(8,"0")}`;
}
export function reviewReasons(entry: ProjectEntry, player: ScoutPlayer|undefined, features: string[], projectVersion: string, datasetVersion: string, today=localDate()) {
  if(entry.status==="Passed")return [];
  const reasons:string[]=[];
  if(entry.reviewDate && entry.reviewDate<=today) reasons.push(entry.reviewDate<today?"Review overdue":"Review due today");
  if(!player)reasons.push("Player record unavailable");
  else {
    if(entry.profileSignature ? entry.profileSignature!==profileSignature(player,features) : (entry.reviewedDatasetVersion??projectVersion)!==datasetVersion)reasons.push(entry.profileSignature?"Imported record changed":"Dataset changed; record needs checking");
    if(features.some(f=>observed(player,f)===null))reasons.push("Supplied metric evidence missing");
  }
  if(!entry.observations?.some(o=>o.outcome==="Observed"))reasons.push("Awaiting a match observation");
  return reasons;
}
export function measuredSummary(p: ScoutPlayer, features: string[], lookup: Percentiles, brief: RecruitmentBrief) {
  const signals=features.map(feature=>({feature,raw:observed(p,feature),rank:percentile(p,feature,lookup)})).filter(s=>s.raw!==null&&s.rank!==null).sort((a,b)=>b.rank!-a.rank!||a.feature.localeCompare(b.feature));
  const findings=signals.filter(s=>s.rank!>=75).slice(0,2).map(s=>({title:`${labels[s.feature]??s.feature}: top-quarter rank`,evidence:`Recorded ${s.raw!.toFixed(2)} /90; sample-adjusted ${s.rank!.toFixed(1)} percentile.`,feature:s.feature}));
  const assessment=assessBrief(p,brief,lookup);
  const gaps=assessment.checks.filter(c=>!c.met).map(c=>({title:`${labels[c.feature]}: ${c.value===null?"cannot be verified":`below your ${c.required?"required":"preferred"} target`}`,evidence:`${c.value===null?"Unavailable":c.value.toFixed(2)} ${c.unit==="per90"?"/90":"percentile"}; target ≥ ${c.minimum}.`,feature:c.feature}));
  return {findings,gaps,gates:assessment.gates,missing:features.filter(f=>observed(p,f)===null),minutes:observed(p,"minutes")};
}
export function recordDecision(entry: ProjectEntry, at = new Date().toISOString()): ProjectEntry {
  if ((entry.history?.length ?? 0) >= 100) throw new Error("This candidate has 100 recorded decisions. Export the history before starting a new project.");
  if (!Number.isFinite(Date.parse(at)) || !validReviewDate(entry.reviewDate ?? "")) throw new Error("Check the review date before recording this decision.");
  return { ...entry, history: [...(entry.history ?? []), { at, status:entry.status, note:entry.note, nextAction:entry.nextAction ?? "", reviewDate:entry.reviewDate ?? "" }] };
}

export function briefReasons(p: ScoutPlayer, brief: RecruitmentBrief, lookup: Percentiles) {
  const assessment = assessBrief(p,brief,lookup);
  const reasons: { text:string; mandatory:boolean; unknown:boolean; gap:number }[] = [];
  if (p.position !== brief.position) reasons.push({text:"Outside the brief's position",mandatory:true,unknown:false,gap:1});
  if (p.season !== brief.season) reasons.push({text:"Outside the brief's season",mandatory:true,unknown:false,gap:1});
  const minutes = observed(p,"minutes");
  if (minutes === null) reasons.push({text:"Minutes unavailable; sample requirement cannot be verified",mandatory:true,unknown:true,gap:1});
  else if (minutes < brief.minimumMinutes) reasons.push({text:`${(brief.minimumMinutes-minutes).toLocaleString()} minutes below the minimum`,mandatory:true,unknown:false,gap:(brief.minimumMinutes-minutes)/Math.max(brief.minimumMinutes,1)});
  for (const c of assessment.checks) {
    if (c.met) continue;
    reasons.push({text:c.value === null ? `${labels[c.feature]} unavailable; ${c.required?"requirement":"preference"} cannot be verified` : `${labels[c.feature]}: ${(c.minimum-c.value).toFixed(c.unit === "percentile" ? 1 : 2)} ${c.unit === "percentile" ? "percentile points" : "/90"} below ${c.required?"minimum":"preference"}`,
      mandatory:c.required,unknown:c.value===null,gap:c.value===null?1:(c.minimum-c.value)/Math.max(c.minimum,.00001)});
  }
  return {assessment,reasons,mandatoryMisses:reasons.filter(r=>r.mandatory).length,unknown:reasons.some(r=>r.mandatory&&r.unknown),gap:reasons.filter(r=>r.mandatory).reduce((s,r)=>s+r.gap,0)};
}
export function evidenceSummary(p: ScoutPlayer, features: string[], exportedAt?: string, now = new Date()) {
  const minutes = observed(p,"minutes");
  const missing = features.filter(f=>observed(p,f)===null);
  const time = exportedAt ? Date.parse(exportedAt) : NaN;
  const ageDays = Number.isFinite(time) ? Math.floor((now.getTime()-time)/86400000) : null;
  const sample = minutes === null ? "Minutes unavailable" : minutes < 900 ? "Early sample" : minutes < 1800 ? "Building sample" : "Established sample";
  const exportLabel = ageDays === null ? "Export date unavailable" : ageDays < 0 ? "Export date is ahead of this device's clock" : `Snapshot exported ${ageDays} days ago`;
  return {minutes,missing,available:features.length-missing.length,total:features.length,sample,ageDays,exportLabel,
    source:typeof p.source_provider === "string" ? p.source_provider : "Source not supplied",
    // Squad context is deliberately not substituted for a performance/match timestamp.
    matchDate:typeof p.last_match_date === "string" && Number.isFinite(Date.parse(p.last_match_date)) ? p.last_match_date.slice(0,10) : null,
    contextDate:typeof p.current_context_as_of === "string" ? p.current_context_as_of.slice(0,10) : null};
}

export type AuditPlayer = {key:string;name:string;position:string;season:string;minutes:number|null;sample:string;cohortSize:number;baselineSize:number;priorRetention:number|null;featureRetention:number|null;weightRetention:number|null;mostSensitiveFeature:string|null};
export type AuditGroup = {position:string;season:string;sample:string;profiles:number;tested:number;thinCohortProfiles:number;priorRetention:number|null;featureRetention:number|null;weightRetention:number|null};
export function auditCohort(pool: ScoutPlayer[], features: string[]): AuditPlayer[] {
  if (!features.length) return [];
  const baselineLookup = buildPercentiles(pool,features,900);
  const scenarios = [0,450,1800].map(prior=>({lookup:buildPercentiles(pool,features,prior),features}));
  const ablations = features.length>1 ? features.map(feature=>({feature,features:features.filter(f=>f!==feature),lookup:buildPercentiles(pool,features.filter(f=>f!==feature),900)})) : [];
  // Reuse numeric matrices across references instead of rebuilding identity strings
  // inside every pairwise metric comparison. The weighted-gap formula is unchanged.
  const keys=pool.map(identity);
  const matrices=new WeakMap<Percentiles,{values:number[][];complete:boolean[]}>();
  const rank = (target:ScoutPlayer, fs:string[], lookup:Percentiles, w:Record<string,number>) => {
    let matrix=matrices.get(lookup);
    if(!matrix){
      const complete=keys.map(key=>fs.every(f=>lookup[key]?.[f]!==undefined));
      matrix={complete,values:keys.map(key=>fs.map(f=>lookup[key]?.[f]??0))};matrices.set(lookup,matrix);
    }
    const index=pool.indexOf(target), metricWeights=fs.map(f=>w[f]??1),total=metricWeights.reduce((s,v)=>s+v,0);
    if(index<0||!matrix.complete[index]||!total)return [];
    const vector=matrix.values[index],scores:{key:string;score:number}[]=[];
    pool.forEach((p,i)=>{
      if(i===index||!matrix!.complete[i]||p.position!==target.position||p.season!==target.season)return;
      let sum=0;for(let f=0;f<fs.length;f++)sum+=(100-Math.abs(vector[f]-matrix!.values[i][f]))*metricWeights[f];
      scores.push({key:keys[i],score:sum/total});
    });
    return scores.sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key)).slice(0,10).map(p=>p.key);
  };
  return pool.map(target=>{
    const w = weights(target.position);
    const baseline = rank(target,features,baselineLookup,w);
    const overlap = (keys:string[]) => baseline.length ? baseline.filter(k=>keys.includes(k)).length/baseline.length*100 : null;
    const priorScores = scenarios.map(s=>overlap(rank(target,s.features,s.lookup,w)));
    const featureScores = ablations.map(s=>({feature:s.feature,retained:overlap(rank(target,s.features,s.lookup,w))})).sort((a,b)=>(a.retained??101)-(b.retained??101)||a.feature.localeCompare(b.feature));
    const weightScores = [{Finishing:160,Creation:65,Involvement:65},{Finishing:65,Creation:160,Involvement:65},{Finishing:65,Creation:80,Involvement:160}].map(p=>overlap(rank(target,features,baselineLookup,weights(target.position,p))));
    const worst = (scores:(number|null)[]) => {const valid=scores.filter((s):s is number=>s!==null);return valid.length?Math.min(...valid):null;};
    return {key:identity(target),name:target.player_name,position:target.position,season:target.season??"Unspecified",minutes:observed(target,"minutes"),sample:evidenceSummary(target,features).sample,cohortSize:pool.length,baselineSize:baseline.length,priorRetention:worst(priorScores),featureRetention:worst(featureScores.map(s=>s.retained)),weightRetention:worst(weightScores),mostSensitiveFeature:featureScores[0]?.retained!==null?featureScores[0]?.feature??null:null};
  });
}
export function summarizeAudit(rows: AuditPlayer[]): AuditGroup[] {
  const groups = new Map<string,AuditPlayer[]>();
  rows.forEach(r=>{const key=JSON.stringify([r.position,r.season,r.sample]);groups.set(key,[...(groups.get(key)??[]),r]);});
  const mean = (rows:AuditPlayer[],field:"priorRetention"|"featureRetention"|"weightRetention") => {const values=rows.map(r=>r[field]).filter((v):v is number=>v!==null);return values.length?values.reduce((s,v)=>s+v,0)/values.length:null;};
  return [...groups.values()].map(g=>({position:g[0].position,season:g[0].season,sample:g[0].sample,profiles:g.length,tested:g.filter(r=>r.baselineSize>0).length,thinCohortProfiles:g.filter(r=>r.baselineSize<10).length,priorRetention:mean(g,"priorRetention"),featureRetention:mean(g,"featureRetention"),weightRetention:mean(g,"weightRetention")})).sort((a,b)=>a.season.localeCompare(b.season)||a.position.localeCompare(b.position)||a.sample.localeCompare(b.sample));
}
export async function auditDataset(players: ScoutPlayer[], features: string[], options: {onProgress?:(completed:number,total:number)=>void;cancelled?:()=>boolean;yieldTask?:()=>Promise<void>} = {}) {
  const cohorts = new Map<string,ScoutPlayer[]>();
  players.forEach(p=>{const key=JSON.stringify([p.position,p.season]);cohorts.set(key,[...(cohorts.get(key)??[]),p]);});
  const rows:AuditPlayer[]=[];
  let completed=0;
  for (const pool of cohorts.values()) {
    if (options.cancelled?.()) throw new Error("Audit cancelled; no partial result is shown as complete.");
    await options.yieldTask?.();
    rows.push(...auditCohort(pool,features));
    options.onProgress?.(++completed,cohorts.size);
  }
  if (options.cancelled?.()) throw new Error("Audit cancelled; no partial result is shown as complete.");
  return {rows,groups:summarizeAudit(rows),profiles:players.length,cohorts:cohorts.size,tested:rows.filter(r=>r.baselineSize>0).length};
}
function pearson(a: number[], b: number[]) {
  const ma = a.reduce((s,v) => s+v,0)/a.length, mb = b.reduce((s,v) => s+v,0)/b.length;
  const va = a.reduce((s,v)=>s+(v-ma)**2,0), vb = b.reduce((s,v)=>s+(v-mb)**2,0);
  return va && vb ? a.reduce((s,v,i)=>s+(v-ma)*(b[i]-mb),0)/Math.sqrt(va*vb) : 0;
}
export function rankingDiagnostics(pool: ScoutPlayer[], target: ScoutPlayer, features: string[], metricWeights = weights(target.position)) {
  const k = Math.min(10, Math.max(0, pool.length - 1));
  const rank = (rows: ScoutPlayer[], fs: string[], prior = 900) => { const lookup = buildPercentiles(rows, fs, prior); return rows.filter(p => identity(p) !== identity(target)).map(p=>({key:identity(p),name:p.player_name,score:resemblance(target,p,fs,lookup,metricWeights)})).filter(p=>p.score!==null).sort((a,b)=>b.score!-a.score!||a.key.localeCompare(b.key)); };
  const baseline = rank(pool,features);
  const baselineKeys = new Set(baseline.slice(0,k).map(p=>p.key));
  const compare = (ranking: ReturnType<typeof rank>) => {
    const keys = new Set(ranking.slice(0,k).map(p=>p.key));
    const common = [...baselineKeys].filter(key=>keys.has(key)).length;
    return { retained: baselineKeys.size ? common / baselineKeys.size * 100 : null, size: ranking.length, top: ranking[0]?.name ?? "Unavailable" };
  };
  const priors = [0,450,900,1800].map(prior=>({prior,...compare(rank(pool,features,prior))}));
  const ablations = features.length > 1 ? features.map(feature=>({feature,...compare(rank(pool,features.filter(f=>f!==feature)))})) : [];
  const cohorts = [450,900,1800].map(minutes=>({minutes,...compare(rank(pool.filter(p=>identity(p)===identity(target)||Number(p.minutes??0)>=minutes),features))}));
  const correlations: { left: string; right: string; correlation: number; observations: number }[] = [];
  features.forEach((left,i)=>features.slice(i+1).forEach(right=>{const rows=pool.filter(p=>observed(p,left)!==null&&observed(p,right)!==null);if(rows.length>=3){const correlation=pearson(rows.map(p=>observed(p,left)!),rows.map(p=>observed(p,right)!));if(Math.abs(correlation)>=.8)correlations.push({left,right,correlation,observations:rows.length});}}));
  // Transparent StandardScaler + cosine baseline, fitted only to this cohort.
  // This tests the legacy method family; it is not a replay of an older global scaler.
  const complete = pool.filter(p=>features.every(f=>observed(p,f)!==null));
  const stats = features.map(f=>{const mean=complete.reduce((s,p)=>s+observed(p,f)!,0)/(complete.length||1);const sd=Math.sqrt(complete.reduce((s,p)=>s+(observed(p,f)!-mean)**2,0)/(complete.length||1));return {mean,sd:sd||1};});
  const vector = (p:ScoutPlayer)=>features.map((f,i)=>(observed(p,f)!-stats[i].mean)/stats[i].sd);
  const targetVector=vector(target), targetNorm=Math.hypot(...targetVector);
  const cosine=features.every(f=>observed(target,f)!==null)&&targetNorm>0?complete.filter(p=>identity(p)!==identity(target)).map(p=>{const v=vector(p),norm=Math.hypot(...v);return {key:identity(p),name:p.player_name,score:norm?targetVector.reduce((s,x,i)=>s+x*v[i],0)/targetNorm/norm:null};}).filter(p=>p.score!==null).sort((a,b)=>b.score!-a.score!||a.key.localeCompare(b.key)):[];
  return {k,baseline:baseline.slice(0,k),priors,ablations,cohorts,correlations:correlations.sort((a,b)=>Math.abs(b.correlation)-Math.abs(a.correlation)),cosine:cosine.slice(0,k),cosineAgreement:compare(cosine),profiles:pool.length,incomplete:pool.filter(p=>features.some(f=>observed(p,f)===null)).length};
}
