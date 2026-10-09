import { assessBrief, baseWeights, buildPercentiles, identity, observed, percentile, rankSimilar, resemblance, weights } from "./recruitment.ts";
import type { Percentiles, RecruitmentBrief, ScoutPlayer } from "./recruitment.ts";

const eps = 1e-8;
const close = (a: number | null, b: number | null) => a === null || b === null ? a === b : Math.abs(a - b) <= eps;
const sampleBand = (p: ScoutPlayer) => observed(p, "minutes") === null ? "Minutes unavailable" : p.minutes! < 900 ? "Under 900 min" : p.minutes! < 1800 ? "900–1,799 min" : "1,800+ min";
type Check = { scope: string; position: string; sample: string; completeness: string; profile: string; check: string; passed: boolean; expected: string; actual: string };
type Group = { scope: string; position: string; sample: string; completeness: string; passed: number; failed: number; checks: number };

export async function behaviorAudit(players: ScoutPlayer[], features: string[], options: { cancelled?: () => boolean; progress?: (done: number, total: number) => void; yieldTask?: () => Promise<void> } = {}) {
  if (!features.length) throw new Error("Supply at least one supported metric.");
  if (features.some(f => !Object.hasOwn(baseWeights.Winger, f)) || new Set(features).size !== features.length) throw new Error("Behavior checks require unique supported metrics.");
  const groups = new Map<string, Group>(), failures: Check[] = [], summary = new Map<string, { check: string; passed: number; failed: number }>();
  let passed = 0, failed = 0, activeProfiles = 0, fixtureScenarios = 0;
  const record = (scope: string, p: ScoutPlayer, completeness: string, check: string, ok: boolean, expected: string, actual: unknown) => {
    const group = { scope, position: p.position, sample: sampleBand(p), completeness }, key = JSON.stringify(group);
    if (!groups.has(key)) groups.set(key, { ...group, passed: 0, failed: 0, checks: 0 });
    const g = groups.get(key)!; g.checks++; ok ? (g.passed++, passed++) : (g.failed++, failed++);
    if (!summary.has(check)) summary.set(check, { check, passed: 0, failed: 0 });
    ok ? summary.get(check)!.passed++ : summary.get(check)!.failed++;
    if (!ok && failures.length < 100) failures.push({ ...group, profile: scope === "Controlled fixtures" ? "Fictional test profile" : p.player_name, check, passed: false, expected, actual: JSON.stringify(actual) ?? "undefined" });
  };
  const run = (scope: string, pool: ScoutPlayer[], p: ScoutPlayer, completeness: string) => {
    const lookup = buildPercentiles(pool, features), metricWeights = weights(p.position), first = features[0];
    const complete = features.every(f => observed(p, f) !== null && percentile(p, f, lookup) !== null);
    const self = resemblance(p, p, features, lookup);
    record(scope, p, completeness, "Self resemblance / unavailable evidence", complete ? close(self, 100) : self === null, complete ? "100 for a fully observed comparable profile" : "No score for incomplete evidence", self);
    const zero = Object.fromEntries(features.map(f => [f, 0]));
    record(scope, p, completeness, "All-zero weights withhold resemblance", resemblance(p, p, features, lookup, zero) === null, "No score", resemblance(p, p, features, lookup, zero));
    const peer = pool.find(q => identity(q) !== identity(p) && q.position === p.position && q.season === p.season && features.every(f => percentile(q, f, lookup) !== null));
    if (peer) {
      const score = resemblance(p, peer, features, lookup);
      record(scope, p, completeness, "Resemblance is symmetric and bounded", close(score, resemblance(peer, p, features, lookup)) && (score === null || score >= -eps && score <= 100 + eps), "Symmetric, 0–100 or unavailable", score);
      record(scope, p, completeness, "Cross-position / season comparison withheld", resemblance(p, { ...peer, position: p.position === "Defender" ? "Winger" : "Defender" }, features, lookup) === null && resemblance(p, { ...peer, season: "Different test season" }, features, lookup) === null, "No cross-cohort score", "Checked position and season independently");
      if (complete) {
        const modified: Percentiles = { ...lookup, [identity(peer)]: { ...lookup[identity(peer)], [first]: percentile(p, first, lookup)! } };
        const toward = resemblance(p, peer, features, modified, metricWeights);
        record(scope, p, completeness, "Closing a rank gap cannot lower resemblance", toward !== null && score !== null && toward + eps >= score, "Nondecreasing under a frozen peer-rank lookup", { before: score, after: toward });
        const x = percentile(p, first, lookup)!, y = percentile(peer, first, lookup)!, away = y >= x ? 100 : 0;
        const outward = resemblance(p, peer, features, { ...lookup, [identity(peer)]: { ...lookup[identity(peer)], [first]: away } }, metricWeights);
        record(scope, p, completeness, "Widening a rank gap cannot raise resemblance", outward !== null && score !== null && outward <= score + eps, "Nonincreasing under a frozen peer-rank lookup", { before: score, after: outward });
        const category = ["goals_p90", "xg_p90", "shots_p90"].includes(first) ? "Finishing" : ["assists_p90", "xa_p90", "key_passes_p90"].includes(first) ? "Creation" : "Involvement";
        const categoryFit = resemblance(p, peer, features, lookup, weights(p.position, { Finishing: 0, Creation: 0, Involvement: 0, [category]: 100 }));
        const emphasized = resemblance(p, peer, features, lookup, weights(p.position, { Finishing: 100, Creation: 100, Involvement: 100, [category]: 200 }));
        record(scope, p, completeness, "Category emphasis moves resemblance toward that category's fit", score !== null && categoryFit !== null && emphasized !== null && Math.abs(emphasized - categoryFit) <= Math.abs(score - categoryFit) + eps, "Doubling a category weight moves the aggregate toward its own fit", { category, baseline: score, categoryFit, emphasized });
      }
    }
    const brief: RecruitmentBrief = { name: "Controlled behavior check", position: p.position, season: p.season ?? "", minimumMinutes: 0, rules: [{ feature: first, minimum: 1, unit: "per90", required: true, weight: 100 }] };
    const base = assessBrief(p, brief, lookup), stricter = assessBrief(p, { ...brief, rules: [{ ...brief.rules[0], minimum: 2 }] }, lookup);
    record(scope, p, completeness, "Stricter raw thresholds cannot improve attainment", (stricter.score ?? -1) <= (base.score ?? -1) + eps && (!stricter.eligible || base.eligible), "Attainment cannot rise or create eligibility", { before: base.score, after: stricter.score });
    const rankedBrief = { ...brief, rules: [{ ...brief.rules[0], unit: "percentile" as const, minimum: 25 }] };
    const rankedBase = assessBrief(p, rankedBrief, lookup), rankedStrict = assessBrief(p, { ...rankedBrief, rules: [{ ...rankedBrief.rules[0], minimum: 75 }] }, lookup);
    record(scope, p, completeness, "Stricter percentile thresholds cannot improve attainment", (rankedStrict.score ?? -1) <= (rankedBase.score ?? -1) + eps && (!rankedStrict.eligible || rankedBase.eligible), "Attainment cannot rise or create eligibility", { before: rankedBase.score, after: rankedStrict.score });
    const minutesGate = assessBrief(p, { ...brief, minimumMinutes: (observed(p, "minutes") ?? 0) + 1, rules: [] }, lookup);
    record(scope, p, completeness, "Playing-time gate cannot be bypassed", !minutesGate.eligible, "Below-minimum or unavailable minutes fail the gate", minutesGate.eligible);
    if (scope === "Controlled fixtures") {
      const small = { ...p, player_name: "Small-sample test", minutes: 180, [first]: 2 }, established = { ...p, player_name: "Established-sample test", minutes: 2400, [first]: 2 };
      const peers = [0, .5, 1].map((v, i) => ({ ...p, player_name: `Shrinkage peer ${i}`, minutes: 1800, [first]: v }));
      const sampleRanks = buildPercentiles([...peers, small, established], [first]);
      record(scope, p, completeness, "Short high-output samples shrink more than established ones", percentile(small, first, sampleRanks)! < percentile(established, first, sampleRanks)!, "Identical above-mean raw output ranks lower with 180 vs 2,400 minutes", { small: percentile(small, first, sampleRanks), established: percentile(established, first, sampleRanks) });
    }
    const missing = { ...p, [first]: undefined }, missingPool = pool.map(q => identity(q) === identity(p) ? missing : q), missingLookup = buildPercentiles(missingPool, features);
    const checkMissing = assessBrief(missing, brief, missingLookup);
    record(scope, p, "One metric removed", "Missing mandatory evidence is not zero", observed(missing, first) === null && percentile(missing, first, missingLookup) === null && !checkMissing.eligible && checkMissing.unknownCount === 1 && resemblance(missing, missing, features, missingLookup) === null, "Unavailable rank/resemblance and failed mandatory requirement", { rank: percentile(missing, first, missingLookup), eligible: checkMissing.eligible, unknown: checkMissing.unknownCount });
    if (observed(p, first) !== null && observed(p, "minutes") !== null) {
      const improved = { ...p, [first]: observed(p, first)! + .2 }, improvedPool = pool.map(q => identity(q) === identity(p) ? improved : q), next = buildPercentiles(improvedPool, features);
      const oldRank = percentile(p, first, lookup), newRank = percentile(improved, first, next);
      record(scope, p, completeness, "Increasing output cannot lower its adjusted rank", oldRank === null || newRank !== null && newRank + eps >= oldRank, "Nondecreasing own-metric rank at fixed minutes/peers", { before: oldRank, after: newRank });
    }
    const context = { ...p, current_status: "Fictional test change", current_club: "Fictional other club", current_age: 30, archetype: "Test label", cluster: 4 };
    record(scope, p, completeness, "Context does not change statistical scoring", close(resemblance(p, p, features, lookup), resemblance(p, context, features, lookup)) && close(base.score, assessBrief(context, brief, lookup).score), "Unchanged score when only contextual displays change", "Compared scores without changing cohort/metrics");
    const reversed = buildPercentiles([...pool].reverse(), features);
    const ranks = features.map(f => close(percentile(p, f, lookup), percentile(p, f, reversed)));
    const list = rankSimilar(pool, p, features, lookup), reordered = rankSimilar([...pool].reverse(), p, features, reversed);
    record(scope, p, completeness, "Input order cannot change scores or tie ordering", ranks.every(Boolean) && list.length === reordered.length && list.every((r, i) => identity(r.player) === identity(reordered[i].player) && close(r.score, reordered[i].score)), "Same ranks and deterministic ordered recommendations", { candidates: list.length, reordered: reordered.length });
    record(scope, p, completeness, "Rankings exclude self and incomplete/cross-cohort rows", list.every(r => identity(r.player) !== identity(p) && r.player.position === p.position && r.player.season === p.season && features.every(f => percentile(r.player, f, lookup) !== null)) && (complete || list.length === 0), "Only fully observed comparable candidates; unavailable target yields no list", list.length);
  };
  const fixtures: Array<{pool: ScoutPlayer[]; target: ScoutPlayer; completeness: string}> = [];
  for (const position of Object.keys(baseWeights)) for (const minutes of [180, 900, 2400]) for (const missing of [0, 1, features.length]) {
    const pool: ScoutPlayer[] = Array.from({ length: 7 }, (_, i) => ({ player_id: i + 1, player_name: `Test ${i + 1}`, club: "Test Club", position, season: "Test season", minutes: i === 3 ? minutes : 1800, cluster: 0, archetype: "Test only", ...Object.fromEntries(features.map((f, j) => [f, .1 + i * .15 + j * .04])) }));
    const target = pool[3]; features.slice(0, missing).forEach(f => { target[f] = undefined; });
    fixtures.push({ pool, target, completeness: missing === 0 ? "Complete" : missing === 1 ? "One metric missing" : "All metrics missing" });
  }
  const cohorts = new Map<string, ScoutPlayer[]>();
  players.forEach(p => { const k = JSON.stringify([p.position, p.season]); if (!cohorts.has(k)) cohorts.set(k, []); cohorts.get(k)!.push(p); });
  // Latest two seasons per position; deterministic, bounded targets and comparison pools.
  const selected = Object.keys(baseWeights).flatMap(position => [...cohorts.values()].filter(c => c[0].position === position).sort((a, b) => String(b[0].season).localeCompare(String(a[0].season))).slice(0, 2));
  const cases: Array<{pool: ScoutPlayer[]; target: ScoutPlayer; completeness: string}> = [];
  for (const cohort of selected) {
    const sorted = [...cohort].sort((a, b) => identity(a).localeCompare(identity(b)));
    for (const band of ["Under 900 min", "900–1,799 min", "1,800+ min", "Minutes unavailable"]) {
      for (const complete of [true, false]) {
        const target = sorted.find(p => sampleBand(p) === band && features.every(f => observed(p, f) !== null) === complete);
        if (target) cases.push({ target, pool: [target, ...sorted.filter(q => identity(q) !== identity(target)).slice(0, 199)], completeness: complete ? "Complete" : "Incomplete" });
      }
    }
  }
  const total = fixtures.length + cases.length;
  for (let i = 0; i < total; i++) {
    await (options.yieldTask?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0)));
    if (options.cancelled?.()) throw new Error("Behavior checks cancelled; no partial result retained.");
    const c = i < fixtures.length ? fixtures[i] : cases[i - fixtures.length], scope = i < fixtures.length ? "Controlled fixtures" : "Active dataset sample";
    run(scope, c.pool, c.target, c.completeness); scope === "Controlled fixtures" ? fixtureScenarios++ : activeProfiles++;
    options.progress?.(i + 1, total);
  }
  if (options.cancelled?.()) throw new Error("Behavior checks cancelled; no partial result retained.");
  return { methodVersion: "recommendation-behavior-v1", passed, failed, checks: passed + failed, fixtureScenarios, activeProfiles, totalCohorts: cohorts.size, testedCohorts: selected.length, maximumCohortSample: 200, groups: [...groups.values()], summary: [...summary.values()], failures, truncated: failed > failures.length, note: "Deterministic invariants and controlled sensitivity checks, not transfer/outcome prediction accuracy. Latest two lexically ordered seasons per position, at most one target per sample-band/completeness cell; bounded comparison pools. Absent strata are not tested. Rank-gap checks freeze the lookup; changing real output may also move peer ranks. No source rows, saved notes or model assignments changed." };
}
