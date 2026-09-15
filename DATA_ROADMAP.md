# Data Roadmap

## Current state

The production web application now uses real, cached football data. The legacy synthetic dataset is retained only for the Streamlit reference interface and development experiments; it does not power the Next.js scouting workspace.

### Available today

- **Understat player seasons:** 1,854 Premier League player-season rows from 2021/22 through 2025/26 after a 450-minute filter.
- **Understat shot locations:** 48,492 attempts across 819 cached player files.
- **StatsBomb Open Data:** recorded on-ball actions for 548 players across all 380 matches in the 2015/16 Premier League season.
- **Identity and availability supplement:** 658 current FPL player rows are available in the normalized data layer but are not used as similarity features.
- **Model output:** standardized per-90 features, five KMeans clusters, cosine-similarity matches, global percentile ranks, and position-aware role labels are exported to the frontend.

### Known boundaries

- The similarity model is strongest for attacking and creative profiles.
- The free primary source does not provide complete defensive, pressure, carry, or progressive-pass metrics.
- Current Understat profiles and historical StatsBomb events cannot be joined into one seasonally consistent event model.
- Age, contract, fee, injury, physical, and off-ball data are not yet available with sufficient consistency.
- Understat access is unofficial and should remain cached and rate-conscious.

## Priorities

### 1. Strengthen the model

- Add position-specific feature weights and user-adjustable recruitment priorities.
- Evaluate similarity stability across seasons and minimum-minute thresholds.
- Add explanations for the strongest matches and largest profile differences.
- Track cluster quality with silhouette scores and monitor cluster drift after data refreshes.
- Separate broad positions into more useful recruitment roles when the source supports them.

### 2. Expand recruitment context

- Add age and availability filters from a stable identity layer.
- Add contract, fee, wage, and transfer-history data from a licensed source.
- Add competition strength and team-style context before comparing across leagues.
- Add low-sample and missing-data flags directly to player cards.

### 3. Improve event coverage

- Use StatsBomb Open Data to validate feature engineering for passes, carries, pressures, and defensive actions.
- Add a licensed current-season provider when full Premier League event coverage is affordable.
- Keep event-derived features separated by competition and season until coverage is comparable.

### 4. Improve delivery

- Add automated source validation and build checks.
- Export shortlists and generate shareable player reports.
- Record dataset and model versions in every generated payload.
- Schedule controlled refreshes once source stability and terms are confirmed.

## Target production schema

```text
player_id
provider_player_id
player_name
team_id
provider_team_id
club
competition_id
competition
season
position
role
age
minutes_played
goals_p90
xg_p90
assists_p90
xa_p90
shots_p90
key_passes_p90
passes_p90
pass_accuracy_pct
progressive_passes_p90
progressive_carries_p90
successful_take_ons_p90
pressures_p90
tackles_interceptions_p90
clearances_p90
source_provider
source_confidence
dataset_version
```

The next major data upgrade should prioritize consistency, licensing, and season coverage over simply adding more columns.
