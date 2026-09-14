# Data Source Test Report

## FPL Public API

Status: `ok`

Verdict: best free bridge for real current PL player stats, but fantasy-shaped

URL tested: `https://fantasy.premierleague.com/api/bootstrap-static/`

HTTP status: `200`

Rows observed: `658`

Elapsed: `502 ms`

Useful fields: id, first_name, second_name, web_name, team, element_type, minutes, goals_scored, assists, expected_goals, expected_assists, ict_index, influence, creativity, threat

Missing for scouting: progressive_passes, progressive_carries, pressures, detailed tactical position

Sample file: `data/source_tests/fpl_bootstrap_sample.json`

Notes:
- Normalized CSV sample: data/source_tests/fpl_players_normalized_sample.csv

## FPL Player History

Status: `ok`

Verdict: useful for player-gameweek time series and past-season summaries

URL tested: `https://fantasy.premierleague.com/api/element-summary/1/`

HTTP status: `200`

Rows observed: `4`

Elapsed: `86 ms`

Useful fields: round, opponent_team, minutes, goals_scored, assists, expected_goals, expected_assists, expected_goal_involvements, expected_goals_conceded, starts, total_points

Missing for scouting: passing detail, carries, pressures, true event locations

Sample file: `data/source_tests/fpl_element_1_sample.json`

Notes:
- No extra notes.

## Understat

Status: `ok`

Verdict: best free scouting-shaped bridge for EPL xG/xA/shots/key passes since 2014-15, but unofficial

URL tested: `https://understat.com/getLeagueData/EPL/2025`

HTTP status: `200`

Rows observed: `537`

Elapsed: `1062 ms`

Useful fields: player_name, games, time, goals, xG, assists, xA, shots, key_passes, position, team_title, npg, npxG, xGChain, xGBuildup

Missing for scouting: tackles, interceptions, clearances, progressive passes, carries, pressures

Sample file: `data/source_tests/understat_epl_players_sample.json`

Notes:
- Normalized CSV sample: data/source_tests/understat_epl_players_normalized_sample.csv
- Unofficial access: use caching and avoid frequent scraping.

## StatsBomb Open Data

Status: `ok`

Verdict: excellent event-data sandbox, not complete modern EPL coverage

URL tested: `https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json`

HTTP status: `200`

Rows observed: `80`

Elapsed: `88 ms`

Useful fields: competition_id, season_id, competition_name, season_name, match_updated, match_available_360

Missing for scouting: complete current Premier League coverage, licensed production feed

Sample file: `data/source_tests/statsbomb_competitions_sample.json`

Notes:
- Relevant competition-season rows in sample filter: 32

## FBref-Style Public Tables

Status: `failed`

Verdict: check access terms or use licensed/exported datasets

URL tested: `https://fbref.com/en/comps/9/stats/Premier-League-Stats`

HTTP status: `403`

Rows observed: `not known`

Elapsed: `not measured ms`

Useful fields: None confirmed

Missing for scouting: None listed

Sample file: `none`

Notes:
- Forbidden

## Kaggle Public Datasets

Status: `manual_review`

Verdict: possible historical CSV source, but dataset freshness and license vary per upload

URL tested: `https://www.kaggle.com/datasets?search=premier+league+player+stats+xg`

HTTP status: `not called`

Rows observed: `not known`

Elapsed: `not measured ms`

Useful fields: None confirmed

Missing for scouting: stable API provider, guaranteed current/live updates, consistent schema

Sample file: `none`

Notes:
- Kaggle API/download requires a Kaggle account token and manual dataset choice.
- Use only datasets with clear license, season coverage, and field definitions.

## football-data.org

Status: `needs_key`

Verdict: identity/fixtures/squads only; not enough scouting metrics

URL tested: `https://api.football-data.org/v4/competitions/PL/teams?season=2025`

HTTP status: `not called`

Rows observed: `not known`

Elapsed: `not measured ms`

Useful fields: None confirmed

Missing for scouting: xG, xA, key passes, dribbles, progressive actions, pressures

Sample file: `none`

Notes:
- Set FOOTBALL_DATA_TOKEN to test authenticated responses.

## API-FOOTBALL / API-Sports

Status: `needs_key`

Verdict: likely best next paid/free-key prototype source for player-season and fixture-player stats

URL tested: `https://v3.football.api-sports.io/players?league=39&season=2025&page=1`

HTTP status: `not called`

Rows observed: `not known`

Elapsed: `not measured ms`

Useful fields: None confirmed

Missing for scouting: must verify xG/xA availability on your plan

Sample file: `none`

Notes:
- Set one of: API_FOOTBALL_KEY, APISPORTS_KEY, RAPIDAPI_KEY.

## Sportmonks

Status: `needs_key`

Verdict: best structured paid candidate; test statistics, transfers, detailed positions, xG includes

URL tested: `https://api.sportmonks.com/v3/football/players?per_page=5&include=statistics.details.type`

HTTP status: `not called`

Rows observed: `not known`

Elapsed: `not measured ms`

Useful fields: None confirmed

Missing for scouting: must verify Premier League historical depth and xG package

Sample file: `none`

Notes:
- Set SPORTMONKS_TOKEN to test authenticated responses.
