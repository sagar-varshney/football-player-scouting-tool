import { fitDemoKMeans, seededRandom } from "./demo-model.ts";
import { assessBrief, buildPercentiles, identity, observed, percentile, resemblance, weights, validateBrief } from "./recruitment.ts";
import { inspectDataset } from "./data-quality.mjs";
import type { ScoutPlayer, RecruitmentBrief } from "./recruitment.ts";

export function rawPositionRanks(players: ScoutPlayer[], player: ScoutPlayer, features: string[]) {
  const pool = players.filter(p => p.position === player.position);
  return Object.fromEntries(features.map(f => {
    const sorted = pool.map(p => observed(p, f)).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const v = observed(player, f);
    return [f, v === null || !sorted.length ? null : ((sorted.indexOf(v) + sorted.lastIndexOf(v)) / 2 + 1) / sorted.length * 100];
  }));
}

export function seasonEvidence(players: ScoutPlayer[], player: ScoutPlayer, feature: string) {
  // Stable IDs, not names: preserve transfer spells as separate rows and flag them.
  return players.filter(p => p.player_id === player.player_id).sort((a, b) => String(a.season).localeCompare(String(b.season)) || a.club.localeCompare(b.club)).map(p => {
    const pool = players.filter(q => q.position === p.position && q.season === p.season);
    const mean = pool.map(q => observed(q, feature)).filter((v): v is number => v !== null);
    return { key: identity(p), season: p.season, club: p.club, position: p.position, raw: observed(p, feature), minutes: observed(p, "minutes"), rank: percentile(p, feature, buildPercentiles(pool, [feature])), cohort: pool.length, cohortMean: mean.length ? mean.reduce((s, v) => s + v, 0) / mean.length : null, transfer: players.filter(q => q.player_id === p.player_id && q.season === p.season).length > 1 };
  });
}

const choose2 = (n: number) => n * (n - 1) / 2;
export function adjustedRand(a: number[], b: number[]) {
  if (a.length !== b.length || a.length < 2) return null;
  const cells = new Map<string, number>(), left = new Map<number, number>(), right = new Map<number, number>();
  a.forEach((v, i) => { const key = `${v}:${b[i]}`; cells.set(key, (cells.get(key) ?? 0) + 1); left.set(v, (left.get(v) ?? 0) + 1); right.set(b[i], (right.get(b[i]) ?? 0) + 1); });
  const sum = (m: Map<unknown, number>) => [...m.values()].reduce((s, n) => s + choose2(n), 0);
  const l = sum(left), r = sum(right), expected = l * r / choose2(a.length), denominator = (l + r) / 2 - expected;
  return Math.abs(denominator) < 1e-12 ? 1 : (sum(cells) - expected) / denominator;
}

export function sampledSilhouette(points: number[][], assignments: number[], seed = 71, maximum = 160) {
  if (points.length !== assignments.length || points.length < 3) return null;
  const rng = seededRandom(seed), indices = points.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [indices[i], indices[j]] = [indices[j], indices[i]]; }
  const sample = indices.slice(0, maximum), groups = new Map<number, number[]>();
  sample.forEach(i => { if (!groups.has(assignments[i])) groups.set(assignments[i], []); groups.get(assignments[i])!.push(i); });
  if (groups.size < 2 || groups.size === sample.length) return null;
  const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0));
  return sample.reduce((sum, i) => {
    const own = groups.get(assignments[i])!;
    if (own.length < 2) return sum;
    const a = own.filter(j => j !== i).reduce((s, j) => s + dist(points[i], points[j]), 0) / (own.length - 1);
    const b = Math.min(...[...groups.entries()].filter(([g]) => g !== assignments[i]).map(([, rows]) => rows.reduce((s, j) => s + dist(points[i], points[j]), 0) / rows.length));
    return sum + (Math.max(a, b) ? (b - a) / Math.max(a, b) : 0);
  }, 0) / sample.length;
}

export async function clusterAudit(players: ScoutPlayer[], features: string[], options: { cancelled?: () => boolean; progress?: (k: number) => void; yieldTask?: () => Promise<void> } = {}) {
  const valid = players.filter(p => features.every(f => observed(p, f) !== null));
  // Bound expensive diagnostics, explicitly report the sample instead of calling it the full dataset.
  const rng = seededRandom(812), indices = valid.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [indices[i], indices[j]] = [indices[j], indices[i]]; }
  const sample = indices.slice(0, 800).map(i => valid[i]);
  const metricRows = (pool: ScoutPlayer[]) => pool.map(p => ({ position: p.position, ...Object.fromEntries(features.map(f => [f, observed(p, f)!])) }));
  const rows = [];
  for (let k = 2; k <= Math.min(7, sample.length - 1); k++) {
    await (options.yieldTask?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0)));
    if (options.cancelled?.()) throw new Error("Cluster audit cancelled; no partial result retained.");
    try {
      const baseline = fitDemoKMeans(metricRows(sample), features, 42, k, 3);
      const points = sample.map(p => features.map((f, j) => (observed(p, f)! - baseline.mean[j]) / baseline.scale[j]));
      const other = fitDemoKMeans(metricRows(sample), features, 43, k, 3);
      const sub = fitDemoKMeans(metricRows(sample.slice(0, Math.max(k + 1, Math.floor(sample.length * .8)))), features, 44, k, 3);
      const projected = sample.map(p => {
        const point = features.map((f, j) => (observed(p, f)! - sub.mean[j]) / sub.scale[j]);
        const ds = sub.centers.map(c => c.reduce((s, v, j) => s + (v - point[j]) ** 2, 0));
        return ds.indexOf(Math.min(...ds));
      });
      const sizes = Array.from({ length: k }, (_, c) => baseline.assignments.filter(g => g === c).length);
      rows.push({ k, inertiaPerProfile: baseline.inertia / sample.length, silhouette: sampledSilhouette(points, baseline.assignments), seedAgreement: adjustedRand(baseline.assignments, other.assignments), sampleAgreement: adjustedRand(baseline.assignments, projected), smallest: Math.min(...sizes), largest: Math.max(...sizes), error: "" });
    } catch (error) { rows.push({ k, error: error instanceof Error ? error.message : "Fit unavailable", silhouette: null, inertiaPerProfile: null, seedAgreement: null, sampleAgreement: null, smallest: 0, largest: 0 }); }
    options.progress?.(k);
  }
  if (options.cancelled?.()) throw new Error("Cluster audit cancelled; no partial result retained.");
  return { total: players.length, complete: valid.length, fitted: sample.length, scope: "pooled positions and seasons", sampleSeed: 812, restarts: 3, silhouetteSample: Math.min(160, sample.length), rows };
}

export function datasetFingerprint(players: ScoutPlayer[], features: string[]) {
  const text = JSON.stringify(players.map(p => [identity(p), p.player_id, p.minutes, ...features.map(f => observed(p, f))]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

type SnapshotInput = { players: ScoutPlayer[]; target: ScoutPlayer; features: string[]; brief: RecruitmentBrief; priorities: Record<string, number>; datasetVersion: string; showFailures: boolean; sort: string };
export function snapshotResults(input: SnapshotInput) {
  const { players, target, features, brief, priorities, showFailures, sort } = input;
  const pool = players.filter(p => p.position === target.position && p.season === target.season), lookup = buildPercentiles(pool, features);
  const candidates = players.filter(p => p.position === brief.position && p.season === brief.season), briefLookup = buildPercentiles(candidates, features);
  return candidates.filter(p => identity(p) !== identity(target)).map(p => ({ key: identity(p), name: p.player_name, assessment: assessBrief(p, brief, briefLookup), similarity: resemblance(target, p, features, lookup, weights(target.position, priorities)) })).filter(r => showFailures || r.assessment.eligible).sort((a, b) => (sort === "similarity" ? (b.similarity ?? -1) - (a.similarity ?? -1) : (b.assessment.score ?? -1) - (a.assessment.score ?? -1)) || (b.similarity ?? -1) - (a.similarity ?? -1) || a.key.localeCompare(b.key));
}

export function buildSnapshot(input: SnapshotInput, createdAt = new Date().toISOString()) {
  const players = input.players.filter(p => (p.position === input.target.position && p.season === input.target.season) || (p.position === input.brief.position && p.season === input.brief.season)).map(p => ({ player_id: p.player_id, player_name: p.player_name, club: p.club, position: p.position, season: p.season, minutes: p.minutes, cluster: p.cluster, archetype: p.archetype, ...Object.fromEntries(input.features.map(f => [f, observed(p, f) ?? undefined])) }));
  const copied = JSON.parse(JSON.stringify({ ...input, players, target: players.find(p => identity(p) === identity(input.target)) }));
  return { schemaVersion: 1, methodVersion: "percentile-gap-900-v1", createdAt, fingerprint: datasetFingerprint(players, input.features), input: copied as SnapshotInput, results: snapshotResults(copied), note: "Contains displayed metric records; local use does not grant redistribution permission. Fingerprint is a change detector, not a security signature." };
}

export function replaySnapshot(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid snapshot");
  const s = value as ReturnType<typeof buildSnapshot>;
  if (s.schemaVersion !== 1 || s.methodVersion !== "percentile-gap-900-v1") throw new Error("Unsupported snapshot method or version");
  const input = s.input;
  if (!input || !Array.isArray(input.players) || input.players.length < 2 || input.players.length > 50000 || !Array.isArray(input.features) || !input.features.length || input.features.some(f => !Object.keys(weights("Winger")).includes(f)) || new Set(input.features).size !== input.features.length) throw new Error("Invalid snapshot records or features");
  if (!input.target || !input.players.some(p => identity(p) === identity(input.target)) || typeof input.showFailures !== "boolean" || !["brief", "similarity"].includes(input.sort)) throw new Error("Invalid snapshot target or filters");
  validateBrief(input.brief);
  if (!input.priorities || ["Finishing", "Creation", "Involvement"].some(k => typeof input.priorities[k] !== "number" || !Number.isFinite(input.priorities[k]) || input.priorities[k] < 0 || input.priorities[k] > 200)) throw new Error("Invalid snapshot priorities");
  if (inspectDataset(input.players, input.features).errors) throw new Error("Snapshot contains invalid or ambiguous records");
  if (datasetFingerprint(input.players, input.features) !== s.fingerprint) throw new Error("Snapshot metrics or identities changed since export");
  const results = snapshotResults(input);
  return { datasetVersion: input.datasetVersion, createdAt: s.createdAt, results, matchesExport: JSON.stringify(results) === JSON.stringify(s.results) };
}
