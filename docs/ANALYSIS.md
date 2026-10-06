# Understanding the scouting analysis

SCOUT//LAB helps compare available statistical profiles. Its numbers describe the supplied dataset, not complete player ability, transfer suitability or predicted performance. This guide describes the current frontend calculations; the optional legacy Python pipeline is a separate workflow.

## Inputs and comparison groups

The interface supports eight per-90 features: goals, expected goals, assists, expected assists, shots, key passes, xGChain (move involvement) and xGBuildup (buildup play). Imports can select a supported subset. An importer validates structure and numbers; it does not establish source accuracy, convert raw totals, or fill absent football observations.

For a count-based statistic, the usual per-90 conversion is `total × 90 / minutes`, with positive playing time. Convert inputs before importing them and preserve the provider's definitions. Equal per-90 values can still hide differences in match context, opponents, tactics and sample size.

The selected position and season define the comparison group (cohort). **Latest season** means the latest season present in the dataset, not automatically the current football season. Finder filters narrow displayed candidates but do not redefine their position/season percentile baseline. Cross-season trends and mixed-role shortlist matrices use each profile's own season/position cohort.

## Small-sample adjustment

For each feature, the interface calculates the arithmetic mean of the cohort's recorded per-90 values, then applies:

```text
adjusted value = (recorded value × minutes + cohort mean × 900) / (minutes + 900)
```

For example, a player with 450 minutes and 0.60 goals/90 in a cohort averaging 0.30 goals/90 receives an adjusted value of 0.40 for ranking. The displayed recorded value remains 0.60 goals/90. At 2,700 minutes, the same input would adjust to 0.525.

This is shrinkage toward a cohort average, not a correction to recorded events or a guarantee of reliability. The frontend currently uses a fixed 900-minute prior; changing a metadata field in an import does not change that implementation.

## Percentiles

Adjusted values are sorted within the cohort. A profile's rank is mapped onto 0–100; tied values receive their average rank. The current implementation assigns 100 to a single-profile cohort, which is not meaningful comparative evidence—use adequately sized cohorts.

A percentile is relative to the included records. It can change when coverage, playing minutes or the comparison pool changes. A higher percentile on an attacking metric is not a universal measure of player quality, and a large radar area is not proof that one player is better overall.

## Similarity and recruitment priorities

For each included feature:

```text
feature fit = 100 − absolute difference between the two percentiles
similarity = weighted average of the feature fits
feature weight = position baseline weight × recruitment-category priority / 100
```

For example, 90th versus 80th percentile produces a feature fit of 90. Final similarity aggregates all included features with their weights. Candidates are drawn from the selected position/season pool, excluding the selected profile itself.

The three categories are **Finishing** (goals, xG, shots), **Creation** (assists, xA, key passes) and **Involvement** (xGChain, xGBuildup). Presets and sliders reweight these categories. They do not alter stored statistics or learn a new model. A high score can describe similar weak profiles as well as similar strong ones.

The separate metric-fit/overlap diagnostic compares relative gaps in recorded values; it is not the same calculation as percentile similarity. Sample indicators summarize recorded minutes, and ranking stability compares candidate ranks across the four predefined briefs. Neither is a calibrated confidence interval, probability of successful recruitment, or validation against future results.

## Playing styles and model boundaries

Clusters and archetypes are supplied labels. The synthetic demo's groups are original fixtures, not trained football conclusions. Importing data does not run KMeans, infer a new playing style or validate supplied labels. The optional legacy Python modelling and validation scripts require their own compatible inputs; their past results must not be presented as validation of a new import.

## What the analysis cannot establish

- Complete defensive ability: the supported comparison features emphasize attacking output and involvement, including for defenders.
- Tactical or physical equivalence: off-ball movement, pressing, athleticism, opposition quality and team context are not comprehensively measured here.
- Future performance or transfer success: the scores describe available records and are not predictive probabilities.
- Current coverage: historical inputs remain historical; importing them does not make them live.
- Observed touch heatmaps: these require separate positional events. Shot-location density is a different view.

Use results to guide further scouting, not replace it. For dataset preparation and the import contract, see [local data setup](LOCAL_DATA.md); for the demonstrated workflow, return to [the README](../README.md#try-the-scouting-workflow).
