# Trust the import before the recommendation

These tools work with the fictional demo and permitted local data. Find them in **Recruitment desk → Analysis tools**. They use no provider requests, paid APIs, cloud inference or automatic uploads. They do not add current-season coverage or establish dataset permissions.

## 1. Preview and validate an import

**Import validation** checks the active profile contract and lets you preview another JSON file without replacing the workspace. Errors include malformed objects, identity/type problems, duplicate or ambiguous records, unsupported features, missing selected statistics, non-finite/negative values, fractional count totals, invalid dates, malformed supplied cluster summaries, and incompatible declared units. Optional totals can be absent; selected per-90 metrics cannot. Unknown/missing selected values are never silently filled with zero or converted from strings.

Declare units in the dataset metadata:

```json
{
  "feature_units": {
    "goals_p90": "per90",
    "xg_p90": "per90",
    "assists_p90": "per90",
    "xa_p90": "per90",
    "shots_p90": "per90",
    "key_passes_p90": "per90",
    "xg_chain_p90": "per90",
    "xg_buildup_p90": "per90"
  },
  "minutes_unit": "minutes",
  "player_id_namespace": "your-stable-provider-id-system"
}
```

Supply declarations for every selected feature. Legacy files without unit declarations are accepted with **units assumed, not verified** warnings, preserving existing installations. Declarations are a source claim, not independently verified evidence. Totals-vs-rate screening checks `total × 90 / minutes` with a tolerance of max(0.015, 3% of expected rate); disagreements are warnings because rounding, definitions and minute conventions differ. Extreme rates, name aliases, multi-club spells and historical supplied diagnostics require review, not automatic correction.

From `frontend`, preview an import against the currently imported file:

```sh
npm run import-data -- /absolute/path/new-data.json --dry-run
```

Optionally save its field-level validation and proposed-change report:

```sh
npm run import-data -- /absolute/path/new-data.json --dry-run --report /absolute/path/import-review.json
```

Omit `--dry-run` only when ready to replace the active dataset. Validation and comparison happen before any dataset write; successful imports use a temporary file and atomic rename. Invalid inputs leave the active file untouched. The optional report describes a proposed import, not proof that it was applied. It contains changed data values. No provider dataset is downloaded or automatically archived. Keep your own permitted source/baseline before replacing an import. Malformed existing files abort replacement; restore/resolve them explicitly rather than silently discarding their provenance.

The local API also validates the loaded JSON before serving it. Invalid files result in an unavailable-data message without changing files. This is schema enforcement, not access control: publicly hosting local mode still discloses data to browsers.

## 2. Compare dataset versions

Use **Export current comparison baseline** before a permitted future import. Later, choose that file with **Compare earlier dataset**. The browser compares locally and shows added/removed/edited records, metadata, feature additions/removals, metric coverage, field values and downstream dependencies. Search retained details by player/name/ID/season/club and filter change type. JSON export retains up to 200 record changes while counts and metric summaries cover all rows; the page shows up to 50 retained records. Caps are explicit.

Baseline exports allowlist profile/metadata fields, omit arbitrary metadata and computed provider percentiles, and use empty supplied cluster summaries. They still contain football records—not just references. Review retention and sharing permissions. No browser history of datasets is saved automatically.

Identity is matched by stable player ID, season, club and position. A name edit is not a new player. A sole spell moving club/position can be paired only when both versions contain exactly one spell for that ID/season. Multi-spell records are preserved; ambiguous moves appear as added/removed instead of guessed merges. IDs must share a namespace; changing declared namespaces is rejected. Different sources without an explicitly shared namespace are also rejected. Declaring a namespace does not verify a cross-provider mapping.

Output/minutes/membership changes can move adjusted peer ranks, similarity and brief attainment—even for unchanged peers. Whether a metric affects a particular decision depends on its feature/weight/brief usage. Pooled style-rule replay can change across seasons; supplied labels and clusters are not refitted. Context-only edits do not affect statistical scores, though filters and evidence dates may change. Rename/club/position edits may break existing name-based saved references; notes are preserved, not automatically reassigned. This comparison is descriptive, not a causal attribution or forecast.

The demo's **Try a fictional change example** illustrates a name/rate edit in memory. It does not change the actual fictional dataset or import anything.

## 3. Check recommendation behavior

**Run recommendation checks** uses the actual shared percentile, resemblance, match-ordering and brief functions. The main dashboard match list now delegates to these same functions, excluding incomplete/cross-cohort rows and withholding scores for all-zero weights. Equal-score candidates have deterministic identity ordering. A singleton does not establish a comparative percentile.

Controlled fixtures cover all four positions, 180/900/2,400-minute samples, complete profiles, one missing metric and all missing metrics. Expectations include:

- fully observed self-resemblance is 100; incomplete evidence is unscored;
- resemblance is symmetric/bounded, and cross-position/season comparisons are withheld;
- closing/widening a percentile gap cannot lower/raise resemblance **with the lookup frozen**;
- increasing one raw output cannot lower that metric's rank at fixed minutes/peer records;
- category emphasis moves aggregate resemblance toward that category's own fit;
- tightening a raw or percentile threshold cannot improve threshold attainment or create eligibility;
- playing-time gates and missing mandatory statistics cannot be bypassed;
- identical above-mean output receives more shrinkage with a short playing-time sample;
- context-only changes leave statistical scoring unchanged;
- input order leaves scores and tie ordering unchanged; recommended lists omit self/incomplete/cross-cohort candidates.

Active-data screening selects the latest two lexically ordered seasons per position, up to one target per playing-time/completeness cell, with each comparison pool bounded to 200 deterministic records. Unrepresented cells are **not tested**, not counted as successes. Failures are grouped by position, sample band and completeness, and expose expected/observed evidence. Cancellation discards partial results; exports retain up to 100 failure details with full aggregate counts. These are deterministic invariants and sensitivity checks—not held-out predictive validation, transfer-success probabilities, or evidence of defensive coverage.

Run `npm test` and `npm run build` in `frontend`. Tests use independently authored fictional fixtures, including temporary import directories; no private dataset is bundled into test fixtures or published.
