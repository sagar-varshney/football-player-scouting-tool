# Recruitment desk

## Player exploration and evidence workflow

- **Quick preview:** candidate cards open an accessible side drawer. Escape or Close returns to the same candidate query, filters, loaded results and scroll position. Compare and shortlist directly; Full report is an explicit navigation action.
- **At a glance:** deterministic summaries show supplied top-quarter metrics, missed or unverified brief targets, minutes and the exact position/season comparison group. Expand each finding to inspect raw values and adjusted percentiles. No LLM calls, tactical inference or transfer predictions.
- **Explore the player pool:** Profile charts includes clickable scatter points, axis presets, name/club highlighting, optional recorded-minute dot sizes and shortlist/comparison colours. An expandable, paginated table supplies keyboard-accessible preview, shortlist and comparison actions. Missing metric pairs are excluded and counted; missing minutes use the smallest dot.
- **Saved analysis lenses:** save selected radar metrics, axes, distribution, value basis, cohort reference and similarity priorities in this browser, separately by position (up to 20). Lenses do not alter brief requirements, raw values or the similarity feature set. Reset restores dashboard priorities; all-zero priorities withhold similarity scores. Lenses are separate from project exports.
- **Scouting review inbox:** Your shortlist aggregates deadlines, missing records/metrics, pending observations and record updates across projects. New candidates save a non-security change-detection signature, not a metric copy; older projects fall back to dataset-version checks. Acknowledge record changes separately from overdue dates and observations. No live or background monitoring.
- **Match observations:** record date, opponent, role, category, Observed/Not observed, timestamp, note and optional http/https link. Manual evidence remains separate from statistical summaries and scores. Up to 100 per candidate; project JSON and printable dossiers include observations. Old exports remain compatible. Export before clearing browser storage. No footage is uploaded or bundled.

These workflows work with the fictional demo or a compatible permitted local import. They do not fetch current-season records or supply missing defensive metrics.

The recruitment desk sits alongside the original dashboard and works with both the included fictional demo and compatible local imports. It does not refresh the dataset, replace the similarity model, require a paid service, or change the existing quick shortlist.

## Three steps, with detail when you need it

Use **Define your search → Review candidates → Your shortlist**. Start with a plain-language preset, then choose position, season and playing time. **Fine-tune targets** retains the original threshold and weight controls. Presets replace search rules, not saved candidate notes or decision history.

Candidate cards show fit, a trade-off and sample strength. Search by name/club, load six more results, or select up to four players and choose **Compare selected**. Comparisons lead with **Met / Missed / Unknown**; exact numbers and source details are expandable. **View player** opens a quick preview, with **Full report** available inside it; **Profile charts** retains radars, distributions and interactive scatter discovery.

Save directly from a card; the first candidate starts a project if none is active. In **Your shortlist**, open **Notes & next steps** for strengths, concerns, actions, review dates and history. **Manage shortlists** holds creation/import controls. Existing exports and printable dossiers remain available. **Analysis tools** separately retains selected-player diagnostics and whole-dataset audits.

The workflow retains scoring formulas and dataset coverage. Optional observations and record-review fields extend the existing version-1 project format while remaining compatible with old exports. Attacking presets do not establish defensive ability or tactical fit.

## Search targets

Open **Recruitment desk → Define your search → Fine-tune targets** to edit metric requirements. Each requirement can use recorded per-90 values or sample-adjusted cohort percentiles.

- Mandatory thresholds control eligibility, even when their weight is zero.
- Preferences affect weighted threshold attainment but do not exclude a candidate.
- Attainment caps each metric at its threshold; fully matching candidates can tie. It is not an overall player-quality score.
- Profile similarity remains a separate, position-weighted percentile-gap score against the selected dashboard player. Different seasons or positions, incomplete vectors and zero total weights are not scored.
- Missing values are unavailable, not observed zero. Comparative percentiles require at least two valid observations for a metric.

Percentiles use the existing 900-minute shrinkage formula and tied midpoint ranks. The new desk withholds singleton and missing-metric scores rather than inventing comparative evidence.

## Review evidence

**Brief compare** puts up to four candidates against the same requirements. It shows eligibility, threshold margins and evidence strength separately from attainment. Select candidates manually or load four leading candidates; fully attained scores can tie, with deterministic alphabetical tie-breaking in this view. The original similarity ranking is unchanged.

In **Review candidates**, expand **Players just outside your search** for measured near-misses, ordered first by mandatory miss count, then normalized shortfall. Exclusions caused by unavailable mandatory evidence are kept separate from measured near-misses. Missing minutes are unverified even when the minimum is zero.

Evidence panels distinguish minutes/sample bands, supplied-metric coverage, snapshot export age and actual match-date coverage. A squad-context date is never substituted for a performance date. An established sample or complete supplied feature vector does not establish comprehensive football coverage.

**Report** produces deterministic summaries of measured signals, sample size, requirements and differences from the selected player. Download a text report for review. No external AI is called, and no unmeasured tactical or defensive skills are asserted.

**Compare** supports the selected player plus three others from the same position/season cohort. It includes an optional cohort-average percentile radar, raw/percentile table, ten-bin recorded-value distribution and whole-cohort scatter plot with median guides. Expected/actual goal or assist pairings also show an equality line. The comparison-card download is an SVG bar comparison with cohort and dataset context.

## Keep projects portable

**Projects** keeps a named brief, up to 64 candidates, review stages, strengths, concerns, follow-up notes and your own evidence links together. Up to 20 projects save in this browser's local storage; they are not cloud-synced. The original quick shortlist remains separate and can be copied into a new project.

JSON export/import preserves project settings and notes, but not the provider dataset. Importing creates a separate copy and retains candidate references that are unavailable in the receiving dataset. CSV export is available for candidate review. Export backups before clearing browser storage. Import validation rejects unsupported schemas, duplicate candidates, out-of-range requirements and non-http/https evidence links. Invalid saved storage is left untouched.

Each candidate can now have a **Next action** and **Review date**. Overdue/today labels use this device's local date. **Record decision** takes an explicit checkpoint of the stage, decision note, next action and review date. Ordinary field edits do not rewrite earlier history. Up to 100 checkpoints per candidate are retained, with a visible limit rather than silently discarding older records. These optional fields remain compatible with earlier version-1 project exports and travel in JSON exports.

## Printable dossiers

Preview a dossier from **Brief compare**, **Report** or **Projects**, then choose **Print / Save as PDF** and select the PDF destination in your browser's print dialog. The separate, light-background dossier includes the brief, selected candidate matrix, vector chart, recorded values, requirement trade-offs, coverage limitations and active project notes/history. Project dossiers chart the first four available candidates but include notes for every project entry, including missing profile references. Dossiers remain local; no external rendering or AI service is used. The original quick-shortlist print layout is preserved when no dossier is open.

## Check ranking sensitivity

**Checks** recomputes the active cohort under 0/450/900/1800-minute priors, one-feature removal and 450/900/1800-minute candidate cutoffs. It screens highly correlated metric pairs and compares the current ranking against unweighted, within-cohort standardized cosine similarity.

Top-10 retention is set overlap, not rank-order stability or transfer-success confidence. The cosine baseline examines the legacy method family; it does not replay the previously fitted Python scaler. These checks do not retrain or modify the model.

**Run whole-dataset audit** extends checks to every imported player-season, independently by position and season. It tests alternative priors (0, 450, 1800), every one-feature removal, and three category-weight presets against balanced position weights with the 900-minute prior. Results group references by position, season and sample band, and expose the most sensitive references. Group percentages average each tested reference's worst-case retention within each scenario family. Unscorable references are excluded from averages and counted separately; short top sets are marked. Cancellation does not publish partial results as complete. Full JSON results can be exported, including dataset identity, actual scenario weights and completion timestamp.

This remains a descriptive sensitivity audit, not held-out predictive validation. Small cohorts can appear stable because there are fewer possible matches, and defensive-role stability does not repair limited defensive metrics. The public demo contains 1,280 synthetic profiles across eight position/season cohorts (160 profiles per cohort). Separately, local verification tested all 1,854 profiles across 20 cohorts in the preserved real-player snapshot; those records are not bundled with the repository.

## Verification

Run `npm test`, `npx tsc --noEmit`, and `npm run build` inside `frontend`. Recruitment tests cover ties, missing data, eligibility, units, score separation, diagnostics and project import validation.

The preserved local snapshot remains 2025/26 performance coverage, not live 2026/27 data. Source permissions and provider limitations are unchanged by these features.
