"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { styleRules } from "../lib/demo-model";
import { inspectDataset } from "../lib/data-quality.mjs";
import { buildSnapshot, clusterAudit, rawPositionRanks, replaySnapshot, seasonEvidence } from "../lib/analysis-insights";
import { buildPercentiles, evidenceSummary, identity, labels, observed, percentile, weights } from "../lib/recruitment";
import type { ProjectEntry, RecruitmentBrief, RecruitmentProject, ScoutPlayer } from "../lib/recruitment";

function download(name: string, content: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const number = (value: number | null | undefined, digits = 2) => value == null ? "—" : value.toFixed(digits);

export function StyleExplanation({ players, player }: { players: ScoutPlayer[]; player: ScoutPlayer }) {
  const explanation = useMemo(() => {
    const ranks = rawPositionRanks(players, player, Object.keys(weights("Winger")));
    if (Object.values(ranks).some(v => v === null)) return null;
    const rules = styleRules(player.position, ranks as Record<string, number>);
    const selected = rules.findIndex(r => r.met);
    return { rules, selected, cohort: players.filter(p => p.position === player.position).length };
  }, [players, player]);
  return <details className="flow-advanced insight-panel"><summary>Why this playing style? <span>Rules, thresholds & nearby alternatives</span></summary>
    <p>Supplied label: <strong>{player.archetype}</strong> · Cluster #{player.cluster + 1} is a separate unsupervised group, not the source of this label or a quality rating.</p>
    {!explanation ? <p>All eight metrics are required to replay these rules. Missing evidence is not treated as zero.</p> : <>
      <p>Current rule replay: <strong>{explanation.rules[explanation.selected].label}</strong>. {explanation.cohort} same-position records across available seasons; raw average-rank percentiles, not the adjusted chart percentiles.</p>
      {explanation.rules[explanation.selected].label !== player.archetype && <p className="desk-warning">This replay differs from the supplied label. Imported labels may use a different rule version or cohort; the imported record is unchanged.</p>}
      <div className="desk-table-scroll"><table><thead><tr><th>Ordered rule</th><th>Evidence</th><th>Outcome</th></tr></thead><tbody>{explanation.rules.map((r, i) => <tr key={r.label}><th>{i + 1}. {r.label}</th><td>{r.checks.length ? r.checks.map((c, j) => <span className="insight-check" key={c.name}>{j > 0 ? (r.any ? " OR " : " AND ") : ""}{c.name}: {c.value.toFixed(1)} {c.operator} {c.threshold} · {c.met ? "met" : "not met"}</span>) : "Fallback when earlier rules fail"}</td><td>{i === explanation.selected ? "Selected: first matching rule" : r.met ? "Also meets rule; earlier rule wins" : r.gap <= 8 ? `Nearby: needs up to ${r.gap.toFixed(1)} rank points on failing condition(s)` : "Not met"}</td></tr>)}</tbody></table></div>
      <p className="desk-footnote">Finishing averages goals/xG/shots; scoring averages goals/xG; creation averages assists/xA/key passes. Nearby means every necessary failing condition is within eight rank points (or one for an OR rule), not a probability. Attacking-only labels do not establish defending or off-ball roles.</p>
    </>}
  </details>;
}

export function ClusterQuality({ players, features, datasetVersion }: { players: ScoutPlayer[]; features: string[]; datasetVersion: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof clusterAudit>> | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const runToken = useRef(0);
  useEffect(() => () => { runToken.current++; }, []);
  async function run() {
    const token = ++runToken.current; setBusy(true); setResult(null); setMessage("Preparing bounded cluster diagnostic…");
    try { const audit = await clusterAudit(players, features, { cancelled: () => token !== runToken.current, progress: k => { if (token === runToken.current) setMessage(`Checked ${k} clusters…`); } }); if (token === runToken.current) { setResult(audit); setMessage("Cluster diagnostic complete. Saved model unchanged."); } }
    catch (e) { if (token === runToken.current) setMessage(e instanceof Error ? e.message : "Audit failed"); }
    finally { if (token === runToken.current) setBusy(false); }
  }
  return <section className="insight-panel"><h3>Cluster quality & stability</h3><p>Compare 2–7 clusters, another initialization seed, and an 80% subsample. This diagnostic refits temporary models only; it does not replace the dataset's cluster assignments.</p>
    <div className="desk-toolbar"><button disabled={busy || players.length < 4} onClick={() => void run()}>{busy ? "Checking clusters…" : "Run cluster diagnostic"}</button>{busy && <button onClick={() => { runToken.current++; setBusy(false); setMessage("Cancelled. No partial result retained."); }}>Cancel cluster diagnostic</button>}{result && <button onClick={() => download("scoutlab-cluster-diagnostic.json", { datasetVersion, ...result })}>Export cluster diagnostic</button>}</div><p role="status">{message}</p>
    {result && <><p>{result.fitted} of {result.complete} complete profiles fitted ({result.total} total). Deterministic sample capped at 800; silhouette uses up to {result.silhouetteSample} sampled profiles. Scope: {result.scope}.</p>
      <div className="desk-table-scroll"><table><thead><tr><th>Clusters</th><th>Sample silhouette</th><th>Inertia/profile</th><th>Seed ARI</th><th>80% sample ARI</th><th>Group sizes</th></tr></thead><tbody>{result.rows.map(r => <tr key={r.k}><th>{r.k}</th>{r.error ? <td colSpan={5}>{r.error}</td> : <><td>{number(r.silhouette, 3)}</td><td>{number(r.inertiaPerProfile, 3)}</td><td>{number(r.seedAgreement, 3)}</td><td>{number(r.sampleAgreement, 3)}</td><td>{r.smallest}–{r.largest}</td></>}</tr>)}</tbody></table></div>
      <p className="desk-footnote">Silhouette: −1 to 1, higher separation is preferable. Inertia normally decreases as clusters increase; do not select k from inertia alone. Adjusted Rand index (ARI): 1 means identical grouping, 0 chance-level agreement, negative possible. Baseline seed 42 vs seed 43; subsample seed 44 projected onto the diagnostic pool, each with three restarts. Position mixing, redundant features and synthetic construction can drive apparent separation. This is not football outcome validation, and one seed/subsample comparison is not a confidence interval.</p></>}
  </section>;
}

export function DataQuality({ players, features }: { players: ScoutPlayer[]; features: string[] }) {
  const result = useMemo(() => inspectDataset(players, features), [players, features]);
  return <details className="flow-advanced insight-panel"><summary>Data quality <span>{result.errors} blocking errors · {result.warnings} review warnings</span></summary>
    <p>{result.profiles} profiles checked. Duplicate keys and ambiguous display identities block imports. Aliases, transfer spells, totals and unusually high rates are review warnings—not automatic corrections.</p>
    <button onClick={() => download("scoutlab-data-quality.json", result)}>Export data-quality report</button>
    {!result.issues.length ? <p>No issues found by these screening rules. This does not certify source accuracy or completeness.</p> : <div className="desk-table-scroll"><table><thead><tr><th>Severity</th><th>Check</th><th>Profiles</th><th>Explanation</th></tr></thead><tbody>{result.issues.slice(0, 50).map((issue, i) => <tr key={i}><td>{issue.severity}</td><td>{issue.code}</td><td>{issue.rows.slice(0, 3).map(r => `${players[r]?.player_name} · ${players[r]?.season}`).join("; ")}</td><td>{issue.message}</td></tr>)}</tbody></table></div>}
    {(result.issues.length > 50 || result.truncated) && <p>First 50 retained issues displayed; JSON retains up to 200. Overall counts include all detected issues.</p>}
  </details>;
}

export function SeasonComparison({ players, player, features }: { players: ScoutPlayer[]; player: ScoutPlayer; features: string[] }) {
  const [feature, setFeature] = useState(features.includes("key_passes_p90") ? "key_passes_p90" : features[0]);
  const rows = useMemo(() => seasonEvidence(players, player, feature), [players, player, feature]);
  const first = rows[0], last = rows.at(-1);
  let anchored: number | null = null;
  if (first && last && first.season !== last.season && !first.transfer && !last.transfer && first.position === last.position && first.raw !== null && last.raw !== null) {
    const initial = players.find(p => identity(p) === first.key)!, latest = players.find(p => identity(p) === last.key)!;
    const replacement = { ...initial, [feature]: latest[feature], minutes: latest.minutes };
    const baseline = players.filter(p => p.position === first.position && p.season === first.season).map(p => identity(p) === first.key ? replacement : p);
    anchored = percentile(replacement, feature, buildPercentiles(baseline, [feature]));
  }
  const validChange = first && last && first.season !== last.season && !first.transfer && !last.transfer && first.position === last.position;
  return <section className="insight-panel"><h3>Output change or comparison-pool change?</h3><label>Season comparison metric<select aria-label="Season comparison metric" value={feature} onChange={e => setFeature(e.target.value)}>{features.map(f => <option key={f} value={f}>{labels[f]}</option>)}</select></label>
    <div className="desk-table-scroll"><table><thead><tr><th>Season / club</th><th>Position</th><th>Recorded /90</th><th>Minutes</th><th>Adjusted rank</th><th>Cohort size</th><th>Cohort mean /90</th></tr></thead><tbody>{rows.map(r => <tr key={r.key}><th>{r.season} · {r.club}{r.transfer ? " · multiple spells" : ""}</th><td>{r.position}</td><td>{number(r.raw)}</td><td>{r.minutes?.toLocaleString() ?? "—"}</td><td>{number(r.rank, 1)}</td><td>{r.cohort}</td><td>{number(r.cohortMean)}</td></tr>)}</tbody></table></div>
    {validChange ? <p>First → latest: recorded change <strong>{first.raw !== null && last.raw !== null ? number(last.raw - first.raw) : "—"} /90</strong>; actual rank change <strong>{first.rank !== null && last.rank !== null ? number(last.rank - first.rank, 1) : "—"} points</strong>. Latest output and minutes against first-season peer records: <strong>{number(anchored, 1)}</strong> percentile.</p> : <p>At least two unambiguous seasons in the same position are needed for the anchored comparison. Multiple club spells remain separate; rates are not added or averaged.</p>}
    <p className="desk-footnote">The anchored replay replaces only this player's first-season output and minutes, retains the first-season peer records, and recalculates the prior mean. It helps inspect pool sensitivity; it is not a causal decomposition or a forecast. Identification uses player ID, not name matching. Missing values remain unavailable.</p>
  </section>;
}

export function ShortlistReview({ project, players, features, onReview }: { project: RecruitmentProject; players: ScoutPlayer[]; features: string[]; onReview: (key: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const keys = selected.filter(k => project.entries.some(e => e.key === k));
  const entries = (keys.length ? project.entries.filter(e => keys.includes(e.key)) : project.entries.slice(0, 4));
  return <details className="flow-advanced insight-panel"><summary>Side-by-side shortlist review <span>Notes, evidence gaps & next actions</span></summary>
    <div className="desk-toolbar">{project.entries.map(e => <label className="desk-check" key={e.key}><input type="checkbox" checked={keys.includes(e.key)} disabled={!keys.includes(e.key) && keys.length >= 4} onChange={() => setSelected(keys.includes(e.key) ? keys.filter(k => k !== e.key) : [...keys, e.key])}/>{players.find(p => identity(p) === e.key)?.player_name ?? "Missing profile"}</label>)}</div>
    <p>Choose up to four; without a selection, the first four are shown. Ranks are calculated in each player's own position/season, not across this shortlist.</p>
    <div className="review-side-grid">{entries.map(e => {
      const p = players.find(p => identity(p) === e.key);
      const lookup = p ? buildPercentiles(players.filter(q => q.position === p.position && q.season === p.season), features) : {};
      return <article key={e.key}><h4>{p?.player_name ?? "Profile missing"}</h4><p>{p ? `${p.club} · ${p.season} · ${p.position}` : e.key}</p><strong>{e.status}</strong>
        {p && <p>{evidenceSummary(p, features).sample} · {p.minutes?.toLocaleString()} minutes</p>}
        {([['Observed strengths', e.strengths], ['Concerns', e.concerns], ['Decision notes', e.note], ['Next action', e.nextAction]] as const).map(([label, text]) => <div key={label}><h5>{label}</h5><p className="scout-note">{text || "Not recorded"}</p></div>)}
        <p>Review date: {e.reviewDate || "Not set"}</p><p>{e.observations?.filter(o => o.outcome === "Observed").length ?? 0} observed entries · {e.observations?.filter(o => o.outcome === "Not observed").length ?? 0} not-observed entries. {!e.evidenceUrl && "No evidence link recorded."}</p>
        {!p ? <p>Dataset record unavailable. Notes are preserved.</p> : <details><summary>Metric evidence</summary>{features.map(f => <p key={f}>{labels[f]}: {number(observed(p, f))} /90 · rank {number(percentile(p, f, lookup), 1)}</p>)}</details>}
        <button onClick={() => onReview(e.key)}>Open notes & next steps</button>
      </article>;
    })}</div>
  </details>;
}

export function AnalysisSnapshots(props: Parameters<typeof buildSnapshot>[0]) {
  const [message, setMessage] = useState("");
  const [replay, setReplay] = useState<ReturnType<typeof replaySnapshot> | null>(null);
  return <details className="flow-advanced insight-panel"><summary>Reproducible analysis snapshot <span>Export the exact settings, metric records & results</span></summary>
    <p>Unlike a portable project backup, this export includes the displayed metric records for the search/reference cohorts. Check data redistribution rights before sharing it. No file is uploaded.</p>
    <div className="desk-toolbar"><button onClick={() => { try { download("scoutlab-analysis-snapshot.json", buildSnapshot(props)); setMessage("Snapshot exported with dataset version, filters, weights and results."); } catch (e) { setMessage(e instanceof Error ? e.message : "Export failed"); } }}>Export analysis snapshot</button>
      <label className="desk-file-button">Replay snapshot locally<input type="file" aria-label="Replay analysis snapshot" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { if (file.size > 30 * 1024 * 1024) throw new Error("Snapshot exceeds 30 MB"); const result = replaySnapshot(JSON.parse(await file.text())); setReplay(result); setMessage(result.matchesExport ? "Replayed results match the exported results exactly." : "Replayed results differ from the exported results. Check settings or stored results; no current workspace data changed."); } catch (error) { setReplay(null); setMessage(error instanceof Error ? error.message : "Replay failed"); } }}/></label></div><p role="status">{message}</p>
    {replay && <><p>{replay.datasetVersion} · {replay.createdAt} · {replay.results.length} replayed results</p><ol>{replay.results.slice(0, 5).map(r => <li key={r.key}>{r.name}: attainment {number(r.assessment.score, 1)} · similarity {number(r.similarity, 1)}</li>)}</ol></>}
  </details>;
}

export function DemoWalkthrough({ players, onScout }: { players: ScoutPlayer[]; onScout: (p: ScoutPlayer) => void }) {
  const [step, setStep] = useState(0);
  const lessons = [
    { suffix: "08", title: "Explore a creator", text: "Inspect key passes and xA, then open the style explanation. A readable role comes from explicit thresholds—not the cluster number." },
    { suffix: "09", title: "Explore a shooter", text: "Compare shooting volume with xG and goals. Use season comparison to separate recorded output from relative rank." },
    { suffix: "06", title: "Challenge a small sample", text: "Only 180 minutes in Demo 02. Check the sample warning and adjusted ranks before adding a candidate. A high rate is not proof of sustainable output." },
  ];
  const lesson = lessons[step], p = players.find(p => p.source_provider === "synthetic" && p.player_name === `Demo Winger ${lesson.suffix}` && p.season === "Demo 02");
  if (!p) return null;
  return <details className="flow-advanced insight-panel"><summary>Guided fictional walkthrough <span>Three examples · no changes to your notes</span></summary>
    <div className="desk-toolbar">{lessons.map((l, i) => <button key={l.suffix} aria-pressed={step === i} onClick={() => setStep(i)}>{i + 1}. {l.title}</button>)}</div><p>{lesson.text}</p><button onClick={() => onScout(p)}>Scout {p.player_name}</button><p className="desk-footnote">These are fictional scenarios, not findings about real players. Exploring does not create a shortlist entry or fabricate a match observation.</p>
  </details>;
}
