# Data Roadmap

## Current state

The production web application now uses real, cached football data. The legacy synthetic dataset is retained only for the Streamlit reference interface and development experiments; it does not power the Next.js scouting workspace.

### Available today

- **Understat player seasons:** 1,854 Premier League player-season rows from 2021/22 through 2025/26 after a 450-minute filter.
- **Understat shot locations:** 48,492 attempts across 819 cached player files.
- **StatsBomb Open Data:** recorded on-ball actions for 548 players across all 380 matches in the 2015/16 Premier League season.
- **Identity and availability supplement:** 662 current FPL player rows retain birth date, status and availability news. A conservative one-to-one linker currently connects 283 identities to the latest Understat cohort; these fields are not similarity features.
- **Model output:** standardized per-90 features and five KMeans clusters are exported to the frontend. The product calculates 900-minute reliability-adjusted season-and-position percentiles, position-weighted matches, category-level explanations, and evidence strength at runtime.
- **Recruitment workflow:** the web app includes a filterable player finder and multi-season trend view. Both use the same reliability adjustment while keeping recorded per-90 values visible.
- **Recruitment briefs:** users can tune similarity toward finishing, creation or involvement, use named presets, save finder searches, and share profile links that preserve the selected weights.
- **Decision workflow:** shortlisted players support review statuses, scout notes, CSV export and printable reports in local browser storage.
- **Reproducibility:** generated payloads expose source-derived dataset and model versions, and automated contract tests validate every committed player profile.
- **Stability evidence:** every recommended match is ranked under balanced, goal-threat, chance-creation and link-player briefs, exposing its rank range and sensitivity label.
- **Role system:** position-specific percentile rules now distinguish six forward roles, six winger roles, six midfielder roles and four defender roles without claiming unavailable defensive or tactical evidence.
- **Shortlist comparison:** mixed-position shortlists are compared with percentiles recalculated inside each player's own season-and-position cohort.
- **Completed-season validation:** 550 returning-player transitions show the 900-minute prior reduces normalized year-ahead error by 10.1% versus raw rates and remains within 0.26% of the best tested prior.
- **Sensitivity and drift monitoring:** all 1,854 profiles are tested across four recruitment briefs; cluster silhouette and season-to-season distribution drift are generated on every export.
- **Evidence flags:** early, building and established sample labels now appear directly on profiles and recruitment-finder cards.
- **Automated delivery checks:** GitHub Actions regenerates model validation, runs the Python contracts and builds the production frontend on pushes and pull requests.
- **API-Football integration:** a cached, environment-keyed enrichment pipeline is ready for quota-safe coverage testing; its fields are not yet active in the production similarity model.
- **API-Football free-plan result:** the 2024/25 team-based pull returned 1,132 normalized rows, including 388 above 450 minutes, but seven club pages were blocked and 2025/26 was unavailable.

### Known boundaries

- The similarity model is strongest for attacking and creative profiles.
- The free primary source does not provide complete defensive, pressure, carry, or progressive-pass metrics.
- Current Understat profiles and historical StatsBomb events cannot be joined into one seasonally consistent event model.
- Age, contract, fee, injury, physical, and off-ball data are not yet available with sufficient consistency.
- Understat access is unofficial and should remain cached and rate-conscious.

## Priorities

### 1. Strengthen the model

- Expand the year-ahead back-test by position and metric only when the additional sample size supports stable conclusions.
- Add transfer-outcome or tactical-fit validation only when a licensed ground-truth dataset is available.
- Split defender and midfielder roles further only when comparable progression and defensive coverage supports it.

### 2. Expand recruitment context

- Add contract, fee, wage, and transfer-history data from a licensed source.
- Add competition strength and team-style context before comparing across leagues.
- Add contract and fee confidence labels when a licensed source becomes available.

### 3. Improve event coverage

- Use StatsBomb Open Data to validate feature engineering for passes, carries, pressures, and defensive actions.
- Add a licensed current-season provider when full Premier League event coverage is affordable.
- Keep event-derived features separated by competition and season until coverage is comparable.

### 4. Improve delivery

- Add live source-health checks only after source terms and request limits support scheduled automation.
- Add account-backed shortlist collaboration only when a hosted backend is justified.
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
