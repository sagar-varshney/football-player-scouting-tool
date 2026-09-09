# Data Roadmap

The current dataset is a product scaffold: real Premier League player names, season-aware club rows where we have local transfer rules, and generated per-90 metrics. It is useful for building the workflow and ML plumbing, but it should not be treated as real scouting evidence yet.

## Current Fixes

- Removed the live/current season from the working sample.
- Limited the generated file to completed seasons: `2021-2022` through `2025-2026`.
- Added Premier League club lists by season so promoted/relegated clubs are not assigned to impossible seasons.
- Added a first pass of player club-history overrides for obvious transfers.
- Replaced generic KMeans archetype labels with position-aware, row-level role labels.

## Best Data Upgrade Paths

1. **football-data.org**

   Use for identity, squads, fixtures, teams, competitions, and match metadata. Keep it as the stable reference layer for player/team IDs once we have an API key.

   Limitation: it does not cover the full scouting feature set we need, such as xG, xA, key passes, carries, pressures, progressive actions, and detailed defensive events.

2. **StatsBomb Open Data**

   Use for event-data prototyping and validating the model design. It is strong for learning how to build possession, pressure, shot, pass, and carry-derived features.

   Limitation: public coverage is not a complete modern Premier League season feed.

3. **API-FOOTBALL / API-Sports**

   Candidate for broader live/stat coverage. Check player statistics, fixtures, lineups, events, league-season availability, and rate limits before committing.

4. **Sportmonks**

   Candidate for paid production data. Check whether the plan includes per-player season stats, expected goals, lineups, injuries, minutes, and fixture-level breakdowns.

5. **FBref-style scouting data**

   Good target schema for inspiration: standard, shooting, passing, passing types, goal/shot creation, possession, and defensive tables. For production, prefer a licensed or API-backed feed rather than brittle scraping.

## Model Improvements

- Add `minutes_played` and exclude low-minute outliers from similarity.
- Store rows as `player_id + season + team_id + competition_id`, not just player name.
- Add position-specific feature weights.
- Split broad positions into scout roles: striker, wide forward, attacking midfielder, defensive midfielder, fullback, centre back.
- Add age and contract filters separately from playing-style similarity.
- Add explanations based on closest matching features and biggest differences.
- Add data-quality flags: generated metric, API metric, missing metric, low sample, transferred mid-season.

## Near-Term Target Schema

```text
player_id
player_name
team_id
club
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
progressive_passes_p90
progressive_carries_p90
dribbles_completed_p90
pressures_p90
tackles_interceptions_p90
clearances_p90
pass_accuracy_pct
source
source_confidence
```
