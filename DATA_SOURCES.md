# Data Sources For Player Scouting

The production web application uses real, cached Understat player-season and shot data. StatsBomb Open Data powers a separate historical event lab, while FPL data is retained as a current-player metadata supplement. Generated metrics remain only in the legacy development path.

## Current implementation

- **Primary scouting profiles:** Understat EPL player seasons from 2021/22 through 2025/26, filtered to 450+ minutes.
- **Shot maps:** cached Understat attempt locations for each available player.
- **Event lab:** StatsBomb Open Data for the complete 2015/16 EPL season available in its repository.
- **Supplement:** normalized current FPL player and availability data.
- **Next upgrade:** a licensed provider with consistent current event, defensive, carrying, contract, and availability coverage.

The API-Football integration is implemented as a local batch pipeline with an 80-request daily safety cap, persistent caching, and field-coverage reporting. It remains an enrichment experiment until actual EPL coverage and redistribution terms are verified.

### API-Football free-plan validation

The authenticated EPL test found:

- Season `2025` is not available on the free plan; the API reported access from `2022` through `2024`.
- League and team player queries are limited to pages 1–3.
- The team-based 2024/25 collection produced 1,132 normalized rows and 388 rows with at least 450 minutes.
- Seven additional club pages were inaccessible, so the collection is explicitly marked partial.
- Among eligible rows, non-null coverage was 95.1% for tackles, 90.2% for interceptions, 99.5% for duels, 99.5% for duel wins, and 89.9% for successful dribbles.
- The provider's season-level `passes.accuracy` field did not behave consistently enough to label as a percentage and is excluded from modelling.

Conclusion: the free API is useful for testing defensive features and enriching matched historical players, but it should not replace the current dataset or power production similarity until the missing pages and current-season restriction are resolved.

## Scout-Grade Reality Check

If the goal is accurate player scouting, generated data and fantasy data are not enough. The dataset needs to represent actual football actions by player, club, season, and ideally match context. That means minutes, positions played, team, competition, shot quality, passing profile, carrying, defensive events, pressure events, and role context.

The serious options are:

| Tier | Source | Best Use | Fit |
| --- | --- | --- | --- |
| Professional | Wyscout | Player scouting, advanced player stats, player career, competition-season data | Very strong |
| Professional | Hudl StatsBomb | Event data, xG, pressures, carries, freeze frames, advanced analysis | Very strong |
| Professional | Opta / Stats Perform | Live and historical event/stat feeds, Opta Vision tracking, recruitment profiling | Very strong |
| Professional | SkillCorner | Tracking, physical data, off-ball runs, game intelligence | Strong add-on |
| Paid API | Sportmonks | Structured player statistics, detailed positions, transfers, expected endpoints | Good if plan coverage is enough |
| Paid/free API | API-FOOTBALL / API-Sports | Broad football API with player/team/fixture stats | Good first API to test |
| Free unofficial | Understat | EPL player-season xG, xA, shots, key passes, xGChain, xGBuildup | Best free scouting-shaped source |
| Free | FPL API | Real current PL player data, xG/xA, minutes, fantasy-oriented form | Useful bridge, not pure scouting |
| Free | StatsBomb Open Data | Event-data prototyping on selective competitions | Great learning source, incomplete EPL coverage |
| Reference only | football-data.org | Teams, fixtures, squads, scorer lists, person-match metadata | Not enough for scouting metrics |

Recommendation if paid data is allowed later: use **API-FOOTBALL or Sportmonks** if we want an affordable working app soon. Use **Wyscout, StatsBomb, or Opta** if we want the tool to be genuinely scout-grade.

Recommendation if we need free data now: use **Understat as the primary scouting dataset**, **FPL as a current-player/status supplement**, and **StatsBomb Open Data as the event-data learning sandbox**.

### 1. API-FOOTBALL / API-Sports

Best fit for the next implementation pass.

Why:

- Has Premier League player season statistics through `/players?league={league_id}&season={year}`.
- Has fixture-level player stats through `/fixtures/players?fixture={fixture_id}`.
- Handles transfers: player statistics are calculated by team, league, and season, and players can have multiple team stat blocks in one season.
- Useful fields include minutes, position, rating, shots, goals, assists, key passes, pass accuracy, tackles, interceptions, duels, successful dribbles, fouls, cards, penalties, and current injury status.

Gaps:

- xG/xA availability depends on endpoint/plan/season coverage. Need test calls before committing.
- Pagination is required for full Premier League seasons.

Suggested first tables:

```text
api_football_players_raw
api_football_fixture_players_raw
players
teams
player_season_stats
player_match_stats
```

### 2. Sportmonks

Best paid-production candidate if we want a cleaner commercial API.

Why:

- Player and team stats are included through fixture calls.
- Has a broad statistics type system.
- Public docs mention player-level expected values through expected endpoints, including xG-like data by player/lineup.
- Good for live products because fixture/player statistics can be fetched in structured JSON.

Gaps:

- Exact data availability depends heavily on subscription plan, includes, and league coverage.
- Need confirm historical Premier League player-stat depth before building importers.

### 3. FPL Public API

Best free source for a quick real-data bridge, especially because we may build an FPL spinoff later.

Why:

- No public auth required for common endpoints.
- `bootstrap-static` gives all current players, clubs, positions, birth dates, price, ownership, total points, xG, xA, ICT, form, availability and public status news.
- `element-summary/{id}` gives per-player gameweek history plus past-season summaries.
- `event/{gw}/live` gives gameweek player performance for all players.

Gaps:

- It is fantasy-oriented, not pure scouting.
- Positions are broad FPL positions, not tactical roles.
- Does not provide full passing/possession/defensive event detail.

Use it for:

- Real names, current clubs, positions, minutes, goals, assists, xG, xA, form.
- Temporary replacement for generated goals/xG/xA/minutes.
- FPL spinoff later.

### 4. Understat

Best free scouting-shaped source we tested successfully.

Why:

- No API key required.
- Covers Premier League seasons through a JSON endpoint used by the site.
- Provides real player-season data such as minutes, games, goals, xG, assists, xA, shots, key passes, non-penalty goals, non-penalty xG, xGChain, and xGBuildup.
- Better aligned with player similarity than FPL because it directly includes chance creation and shot-quality metrics.

Gaps:

- It is unofficial access rather than a formal public API.
- Does not cover defensive detail, progressive passes, carries, pressures, or event locations.
- Must be cached locally and fetched politely; we should not hammer the endpoint.

Use it for:

- First real replacement for generated attacking/creative metrics.
- Player-season similarity for forwards, wingers, and attacking midfielders.
- xG/xA/key-pass based archetypes.

### 5. FBref-Style Data

Best schema for a scout-friendly public-data prototype if we can use a compliant access route.

Why:

- League player tables include standard, shooting, passing, passing types, goal/shot creation, defensive, and possession categories.
- Strong match logs contain exactly the style metrics we want: xG, xA, shots, key passes, progressive passes, tackles, interceptions, clearances, carries, progressive carries, take-ons, touches.
- Public datasets based on FBref exist for 2021-22 and 2022-23 match logs.

Gaps:

- Direct scraping can be brittle and may violate terms/rate expectations.
- Public Kaggle datasets may have unknown licenses and limited seasons.
- For production, use licensed/approved access or a third-party API wrapper with clear terms.

### 6. StatsBomb Open Data

Best for validating advanced event-data features.

Why:

- True event data: shots, passes, carries, pressures, locations, freeze frames in covered competitions.
- Excellent for building and testing feature engineering before paying for data.

Gaps:

- Not complete modern Premier League coverage.
- Player similarity trained only on this data will not cover the full EPL target pool.

Use it for:

- Feature engineering experiments.
- xG/event model prototypes.
- Validating tactical/role metrics before production API integration.

### 7. football-data.org

Keep as a supporting identity and fixtures source, not the scouting-stat source.

Why:

- Good for competitions, teams, squads, fixtures, matches, scorers, and person-match metadata.
- Useful stable source for team/squad identity and schedule joins.

Gaps:

- Not enough player performance detail for our similarity engine.
- Does not provide the full feature set: xG, xA, key passes, progressive passes, carries, dribbles, pressures.

## Decision

Keep **Understat** as the free primary source and **StatsBomb Open Data** as the event-feature sandbox. Evaluate **API-FOOTBALL** or **Sportmonks** for broader structured coverage before taking on a professional scouting feed. Move to **Wyscout, Hudl StatsBomb, Opta, or another licensed provider** when current, complete event data becomes a product requirement.

## Local Test Results

Run:

```bash
python scripts/test_data_sources.py
```

Latest local report:

- `data/source_tests/REPORT.md`
- `data/source_tests/summary.json`
- `data/source_tests/fpl_players_normalized_sample.csv`
- `data/source_tests/fpl_bootstrap_sample.json`
- `data/source_tests/fpl_element_1_sample.json`
- `data/source_tests/statsbomb_competitions_sample.json`
- `data/source_tests/understat_epl_players_normalized_sample.csv`
- `data/source_tests/understat_epl_players_sample.json`

Free data build outputs:

- `data/free_data/understat_epl_player_seasons.csv`
- `data/free_data/fpl_current_players.csv`
- `data/free_data/QUALITY_REPORT.md`
- `data/free_data/metadata.json`

Current findings:

- FPL Public API works without a key and returned current player rows with real minutes, starts, goals, assists, expected goals, expected assists, CBI, recoveries, tackles, influence, creativity, and threat.
- FPL player history works without a key and returned gameweek-level player rows plus past-season summaries.
- Understat works without a key and returned EPL player-season rows with minutes, goals, xG, assists, xA, shots, key passes, xGChain, and xGBuildup.
- The multi-season free-data builder produced `1,854` Understat player-season rows across `2021-2022` through `2025-2026` after a `450` minute filter.
- The latest cached refresh produced `662` current FPL player rows. `283` identities were conservatively joined one-to-one to the latest Understat cohort for age and availability context; ambiguous and unmatched identities remain blank.
- StatsBomb Open Data works without a key and returned real event-data competition metadata.
- FBref direct access returned `403` from the local probe, so do not build the product around scraping it.
- football-data.org, API-FOOTBALL/API-Sports, and Sportmonks need credentials before we can judge actual plan coverage.

## Import Plan

1. Create provider-specific raw importers.
2. Store raw JSON unchanged.
3. Normalize into `player_match_stats` and `player_season_stats`.
4. Compute per-90 metrics only after minutes filtering.
5. Add source confidence flags to the UI.
6. Build role/archetype labels from real position-specific percentiles.

## Minimum Viable Real Schema

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
minutes_played
goals
assists
xg
xa
shots
key_passes
passes
passes_completed
pass_accuracy_pct
dribbles_attempted
dribbles_completed
tackles
interceptions
clearances
progressive_passes
progressive_carries
source_provider
source_confidence
```
