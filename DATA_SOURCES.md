# Data Sources For Player Scouting

This project should move away from generated metrics. The scouting engine needs player-season or player-match rows with minutes, team, season, position, and repeatable performance fields.

## Recommended Path

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
- `bootstrap-static` gives all current players, clubs, positions, price, ownership, total points, xG, xA, ICT, form, and availability.
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

### 4. FBref-Style Data

Best schema for a scout-friendly public-data prototype if we can use a compliant access route.

Why:

- League player tables include standard, shooting, passing, passing types, goal/shot creation, defensive, and possession categories.
- Strong match logs contain exactly the style metrics we want: xG, xA, shots, key passes, progressive passes, tackles, interceptions, clearances, carries, progressive carries, take-ons, touches.
- Public datasets based on FBref exist for 2021-22 and 2022-23 match logs.

Gaps:

- Direct scraping can be brittle and may violate terms/rate expectations.
- Public Kaggle datasets may have unknown licenses and limited seasons.
- For production, use licensed/approved access or a third-party API wrapper with clear terms.

### 5. StatsBomb Open Data

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

### 6. football-data.org

Keep as a supporting identity and fixtures source, not the scouting-stat source.

Why:

- Good for competitions, teams, squads, fixtures, matches, scorers, and person-match metadata.
- Useful stable source for team/squad identity and schedule joins.

Gaps:

- Not enough player performance detail for our similarity engine.
- Does not provide the full feature set: xG, xA, key passes, progressive passes, carries, dribbles, pressures.

## Decision

For the next real data implementation, start with **API-FOOTBALL** if the goal is a usable Premier League player scouting prototype quickly. Use **Sportmonks** if we decide to pay for a more production-oriented provider. Use **FPL API** as the free fallback to replace obviously fake output metrics while we evaluate paid APIs.

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
