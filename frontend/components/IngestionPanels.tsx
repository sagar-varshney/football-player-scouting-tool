"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareDatasets, inspectImport, validateDataset } from "../lib/dataset-contract.mjs";
import type { Dataset, DatasetComparison, ImportReport } from "../lib/dataset-contract.mjs";
import { behaviorAudit } from "../lib/behavior-audit";
import { labels } from "../lib/recruitment";
import type { ScoutPlayer } from "../lib/recruitment";

type DatasetProps = { players: ScoutPlayer[]; features: string[]; metadata: Dataset["metadata"]; dataMode?: string };
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readJson(file: File) {
  if (file.size > 30 * 1024 * 1024) throw new Error("File exceeds 30 MB.");
  return JSON.parse(await file.text()) as unknown;
}
function currentDataset({ metadata, players, features }: DatasetProps): Dataset {
  return { metadata: { ...metadata, features }, players, cluster_profiles: [] };
}
// Baseline exports use an allowlist; do not copy arbitrary provider metadata, secrets or computed fields.
function baselineFile(dataset: Dataset) {
  const metaFields = ["features", "dataset_version", "model_version", "source_provider", "player_id_namespace", "generated_at", "context_version", "context_provider", "current_context_as_of", "feature_units", "minutes_unit", "minimum_minutes", "reliability_prior_minutes"];
  const fields = ["player_id", "player_name", "club", "season", "position", "minutes", "cluster", "archetype", "source_provider", "last_match_date", "matches", "goals", "xg", "assists", "xa", "shots", "key_passes", "xg_chain", "xg_buildup", "non_penalty_goals", "non_penalty_xg", "age", "current_age", "current_club", "current_status", "current_status_code", "current_news", "current_context_as_of", "nationality", "preferred_foot", ...dataset.metadata.features];
  return { metadata: Object.fromEntries(metaFields.filter(f => dataset.metadata[f] !== undefined).map(f => [f, dataset.metadata[f]])), players: dataset.players.map(p => Object.fromEntries(fields.filter(f => p[f] !== undefined).map(f => [f, p[f]]))), cluster_profiles: [] };
}
function ValidationReport({ report }: { report: ImportReport }) {
  return <><p><strong>{report.errors} blocking errors · {report.warnings} review warnings</strong> · {report.profiles.toLocaleString()} profiles</p>
    {!report.issues.length ? <p>No issues found by these checks. This does not certify football accuracy, source permissions or current-season coverage.</p> : <div className="desk-table-scroll"><table><thead><tr><th>Severity</th><th>Field / row</th><th>What to check</th></tr></thead><tbody>{report.issues.slice(0, 50).map((i, n) => <tr key={n}><td>{i.severity}</td><th>{i.path}</th><td>{i.message}</td></tr>)}</tbody></table></div>}
    {(report.issues.length > 50 || report.truncated) && <p>First 50 issues displayed. The report retains up to 200; counts include all detected issues.</p>}</>;
}

export function ImportValidation(props: DatasetProps) {
  const current = useMemo(() => inspectImport(currentDataset(props)), [props.metadata, props.players, props.features]);
  const [preview, setPreview] = useState<{name: string; report: ImportReport} | null>(null), [message, setMessage] = useState("");
  return <details className="flow-advanced insight-panel"><summary>Import validation <span>{current.errors} errors · {current.warnings} warnings · preview without replacing data</span></summary>
    <p>Check types, identities, selected metrics, declared units, count fields and totals-versus-rates. Missing selected statistics block imports rather than becoming zero. Names, transfer spells and source statistics are never rewritten.</p>
    <h4>Current dataset</h4><ValidationReport report={current}/>
    <div className="desk-toolbar"><button onClick={() => download("scoutlab-current-validation.json", current)}>Export current validation report</button>
      <label className="desk-file-button">Preview a dataset file<input type="file" aria-label="Preview dataset validation" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { const report = inspectImport(await readJson(file)); setPreview({ name: file.name, report }); setMessage("Preview only. Active data, notes and model assignments are unchanged."); } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "Could not read file"); } }}/></label></div>
    <p role="status">{message}</p>{preview && <section><h4>Proposed file: {preview.name}</h4><ValidationReport report={preview.report}/><button onClick={() => download("scoutlab-import-validation.json", preview)}>Export preview report</button></section>}
    <p className="desk-footnote">Declared units must be per90 for selected features and minutes for playing time. Older files with no declarations are accepted with explicit warnings; naming and arithmetic cannot prove provider definitions. Total/rate differences allow rounding and are warnings for review. CLI dry runs use the same validation contract.</p>
  </details>;
}
const value = (v: unknown) => v === null || v === undefined ? "Unavailable / not declared" : typeof v === "object" ? JSON.stringify(v) : String(v);
export function DatasetVersions(props: DatasetProps) {
  const dataset = useMemo(() => currentDataset(props), [props.metadata, props.players, props.features]);
  const [report, setReport] = useState<DatasetComparison | null>(null), [message, setMessage] = useState("");
  const [query, setQuery] = useState(""), [kind, setKind] = useState("all");
  useEffect(() => { setReport(null); setMessage(""); }, [props.metadata, props.players, props.features]);
  const changes = report?.changes.filter(c => (kind === "all" || c.kind === kind) && `${c.name} ${c.playerId} ${c.season} ${c.previousClub} ${c.currentClub}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <details className="flow-advanced insight-panel"><summary>Dataset-version comparison <span>Changed records, metric coverage & downstream effects</span></summary>
    <p>Choose an earlier compatible dataset or exported baseline to compare with this workspace. This reads the file locally; it does not import it, send it to a server, update notes or infer fuzzy name matches. IDs must use the same provider/namespace.</p>
    <div className="desk-toolbar"><button onClick={() => { try { const baseline = baselineFile(dataset); validateDataset(baseline); download("scoutlab-dataset-baseline.json", baseline); setMessage("Baseline exported. It contains data records; keep it only where retention is permitted."); } catch (error) { setMessage(error instanceof Error ? error.message : "Export failed"); } }}>Export current comparison baseline</button>
      <label className="desk-file-button">Compare earlier dataset<input type="file" aria-label="Compare earlier dataset" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { setReport(compareDatasets(await readJson(file), dataset)); setMessage(`Earlier file: ${file.name}. Compared with the current workspace; no data changed.`); } catch (error) { setReport(null); setMessage(error instanceof Error ? error.message : "Comparison failed"); } }}/></label>
      {props.dataMode === "demo" && <button onClick={() => {
        const proposed = JSON.parse(JSON.stringify(baselineFile(dataset))) as Dataset;
        const p = proposed.players[0], f = props.features.includes("key_passes_p90") ? "key_passes_p90" : props.features[0], total = f.replace(/_p90$/, "");
        p.player_name += " (example edit)";
        if (typeof p[total] === "number" && p.minutes! > 0) { p[total] = Number(p[total]) + 1; p[f] = Number((Number(p[total]) * 90 / p.minutes!).toFixed(4)); } else p[f] = Number(p[f]) + .1;
        proposed.metadata.dataset_version = `${props.metadata.dataset_version ?? "demo"}-illustrative-edit`;
        setReport(compareDatasets(dataset, proposed)); setMessage("Fictional illustration: one name and metric edited in memory. This is not an actual import; the active dataset is unchanged.");
      }}>Try a fictional change example</button>}
      {report && <button onClick={() => download("scoutlab-dataset-comparison.json", report)}>Export comparison report</button>}</div>
    <p role="status">{message}</p>
    {report && <><h4>{report.previousVersion} → {report.currentVersion}</h4><p>{report.previousProfiles.toLocaleString()} → {report.currentProfiles.toLocaleString()} profiles · <strong>{report.changed} changed · {report.added} added · {report.removed} removed · {report.unchanged} unchanged</strong></p>
      <p>Features added: {report.addedFeatures.map(f => labels[f] ?? f).join(", ") || "none"}. Removed: {report.removedFeatures.map(f => labels[f] ?? f).join(", ") || "none"}.</p>
      <div className="desk-table-scroll"><table><thead><tr><th>Metric</th><th>Coverage before → now</th><th>Matched rows changed</th><th>Increased / decreased</th><th>Became available / unavailable</th></tr></thead><tbody>{Object.entries(report.metricChanges).map(([f, s]) => <tr key={f}><th>{labels[f] ?? f}</th><td>{s.coverageBefore} / {report.previousProfiles} → {s.coverageAfter} / {report.currentProfiles}</td><td>{s.changed}</td><td>{s.increased} / {s.decreased}</td><td>{s.unavailableBefore} / {s.unavailableAfter}</td></tr>)}</tbody></table></div>
      <details><summary>Metadata and affected comparison pools</summary>{report.metadataChanges.length ? report.metadataChanges.map(c => <p key={c.field}><strong>{c.field}</strong>: {value(c.before)} → {value(c.after)}</p>) : <p>No tracked metadata changes.</p>}
        {report.affectedCohorts.map(c => <p key={c.position + c.season}>{c.position} · {c.season}: {c.fields.map(f => labels[f] ?? f).join(", ")}. Peer ranks may change even when an individual row is unchanged.</p>)}</details>
      <div className="desk-toolbar"><label>Find changed player<input aria-label="Find changed player" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, ID, season or club"/></label><label>Change type<select aria-label="Dataset change type" value={kind} onChange={e => setKind(e.target.value)}><option value="all">All changes</option><option value="changed">Edited records</option><option value="added">Added records</option><option value="removed">Removed records</option></select></label></div>
      <div className="desk-table-scroll"><table><thead><tr><th>Player / record</th><th>Change</th><th>Before → after</th><th>What it affects</th></tr></thead><tbody>{changes.slice(0, 50).flatMap((c, i) => c.fields.length ? c.fields.map(f => <tr key={`${i}-${f.field}`}><th>{c.name} · #{c.playerId}<br/>{c.season} · {c.previousClub} → {c.currentClub}</th><td>{labels[f.field] ?? f.field}</td><td>{value(f.before)} → {value(f.after)}</td><td>{f.impact}</td></tr>) : [<tr key={i}><th>{c.name} · #{c.playerId} · {c.season}</th><td>{c.kind}</td><td>{c.previousClub ?? "—"} → {c.currentClub ?? "—"}</td><td>Comparison-pool membership, rankings, similarity and filters</td></tr>])}</tbody></table></div>
      {!changes.length && <p>No retained record changes match this view.</p>}{(report.truncated || changes.length > 50) && <p>Up to 50 retained record changes displayed; comparison retains up to 200. Counts and metric totals include all records. Filtered views cannot recover omitted details.</p>}
      <p className="desk-footnote">{report.note} Raw output changes and peer-pool changes are not a causal explanation. Supplied group summaries/cluster labels are not automatically retrained.</p></>}
    <p className="desk-footnote">Baselines and difference reports contain football records. Exporting does not grant retention or redistribution rights. No historical copies are retained automatically; keep your own permitted baseline before a future import.</p>
  </details>;
}

export function RecommendationBehavior({ players, features, datasetVersion }: { players: ScoutPlayer[]; features: string[]; datasetVersion: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof behaviorAudit>> | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const token = useRef(0);
  useEffect(() => () => { token.current++; }, []);
  async function run() {
    const active = ++token.current; setBusy(true); setResult(null);
    try {
      const result = await behaviorAudit(players, features, { cancelled: () => active !== token.current, progress: (done, total) => { if (active === token.current) setMessage(`Checked ${done} of ${total} controlled scenarios and sampled profiles…`); } });
      if (active === token.current) { setResult(result); setMessage(result.failed ? `Completed with ${result.failed} failed checks. Review the failures below.` : "All tested invariants passed. This is not a prediction-accuracy score."); }
    } catch (error) { if (active === token.current) setMessage(error instanceof Error ? error.message : "Checks failed"); }
    finally { if (active === token.current) setBusy(false); }
  }
  return <details className="flow-advanced insight-panel"><summary>Recommendation behavior checks <span>Controlled changes · positions, playing time & missing evidence</span></summary>
    <p>Exercise the shared ranking, similarity and brief functions. Synthetic scenarios cover all four positions and three playing-time levels, including deliberately missing metrics; a bounded sample also checks the active dataset. No source statistics or model assignments change.</p>
    <div className="desk-toolbar"><button disabled={busy} onClick={() => void run()}>{busy ? "Checking recommendation behavior…" : "Run recommendation checks"}</button>{busy && <button onClick={() => { token.current++; setBusy(false); setMessage("Cancelled; no partial result retained."); }}>Cancel recommendation checks</button>}{result && <button onClick={() => download("scoutlab-recommendation-behavior.json", { datasetVersion, ...result })}>Export behavior report</button>}</div><p role="status">{message}</p>
    {result && <><p><strong>{result.passed} passed · {result.failed} failed</strong> · {result.fixtureScenarios} fictional scenarios · {result.activeProfiles} active sampled profiles · {result.testedCohorts} / {result.totalCohorts} cohorts included</p>
      <div className="desk-table-scroll"><table><thead><tr><th>Controlled expectation</th><th>Passed</th><th>Failed</th></tr></thead><tbody>{result.summary.map(s => <tr key={s.check}><th>{s.check}</th><td>{s.passed}</td><td>{s.failed}</td></tr>)}</tbody></table></div>
      <details><summary>Coverage by position, playing time and completeness</summary><p>Unrepresented active-data strata are not tested—not automatically passed. Each cohort sample contains at most {result.maximumCohortSample} records; these are screening samples, not a full population audit.</p>
        <div className="desk-table-scroll"><table><thead><tr><th>Scope</th><th>Position</th><th>Playing time</th><th>Evidence</th><th>Passed / failed</th></tr></thead><tbody>{result.groups.map((g, i) => <tr key={i}><td>{g.scope}</td><td>{g.position}</td><td>{g.sample}</td><td>{g.completeness}</td><td>{g.passed} / {g.failed}</td></tr>)}</tbody></table></div></details>
      {!!result.failures.length && <div className="desk-table-scroll"><table><thead><tr><th>Profile / scope</th><th>Failed expectation</th><th>Expected</th><th>Observed</th></tr></thead><tbody>{result.failures.map((f, i) => <tr key={i}><th>{f.profile} · {f.position} · {f.sample}<br/>{f.scope}</th><td>{f.check}</td><td>{f.expected}</td><td>{f.actual}</td></tr>)}</tbody></table></div>}
      <p className="desk-footnote">{result.note} {result.truncated && "Only the first 100 failures are retained."} Passing checks does not establish a player's suitability, defensive ability or future performance.</p></>}
  </details>;
}
