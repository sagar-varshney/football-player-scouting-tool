"""Probe candidate football data sources for the scouting engine.

The script writes a Markdown report and small JSON samples under
`data/source_tests/`. It is intentionally read-only against providers.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "source_tests"

USER_AGENT = "FootballPlayerScoutingTool/1.0 (+local data-source evaluation)"


@dataclass
class ProbeResult:
    provider: str
    status: str
    verdict: str
    url: str
    http_status: int | None = None
    rows: int | None = None
    useful_fields: list[str] = field(default_factory=list)
    missing_for_scouting: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    sample_file: str | None = None
    elapsed_ms: int | None = None


def fetch_json(url: str, headers: dict[str, str] | None = None, timeout: int = 20) -> tuple[int, Any, int]:
    request_headers = {"User-Agent": USER_AGENT, **(headers or {})}
    req = urllib.request.Request(url, headers=request_headers)
    start = time.monotonic()
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read()
        if response.headers.get("Content-Encoding", "").lower() == "gzip" or raw.startswith(b"\x1f\x8b"):
            raw = gzip.decompress(raw)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return response.status, json.loads(raw.decode("utf-8")), elapsed_ms


def write_sample(name: str, payload: Any) -> str:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False)[:120_000], encoding="utf-8")
    return str(path.relative_to(ROOT))


def write_csv_sample(name: str, rows: list[dict[str, Any]], fields: list[str]) -> str:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})
    return str(path.relative_to(ROOT))


def keys_present(items: list[str]) -> list[str]:
    return [item for item in items if os.environ.get(item)]


def probe_fpl() -> ProbeResult:
    url = "https://fantasy.premierleague.com/api/bootstrap-static/"
    try:
        http_status, data, elapsed_ms = fetch_json(url)
    except Exception as exc:
        return ProbeResult("FPL Public API", "failed", "retry", url, notes=[repr(exc)])

    elements = data.get("elements", [])
    first = elements[0] if elements else {}
    fields = [
        field
        for field in [
            "id",
            "first_name",
            "second_name",
            "web_name",
            "team",
            "element_type",
            "minutes",
            "goals_scored",
            "assists",
            "expected_goals",
            "expected_assists",
            "shots",
            "key_passes",
            "ict_index",
            "influence",
            "creativity",
            "threat",
        ]
        if field in first
    ]
    sample_file = write_sample("fpl_bootstrap_sample", {"teams": data.get("teams", [])[:3], "elements": elements[:5]})
    csv_file = write_csv_sample(
        "fpl_players_normalized_sample",
        elements[:100],
        [
            "id",
            "first_name",
            "second_name",
            "web_name",
            "team",
            "element_type",
            "minutes",
            "starts",
            "goals_scored",
            "assists",
            "expected_goals",
            "expected_goals_per_90",
            "expected_assists",
            "expected_assists_per_90",
            "expected_goal_involvements",
            "expected_goal_involvements_per_90",
            "clearances_blocks_interceptions",
            "recoveries",
            "tackles",
            "defensive_contribution",
            "ict_index",
            "influence",
            "creativity",
            "threat",
            "selected_by_percent",
            "now_cost",
            "status",
        ],
    )
    missing = ["progressive_passes", "progressive_carries", "pressures", "detailed tactical position"]
    verdict = "best free bridge for real current PL player stats, but fantasy-shaped"
    return ProbeResult(
        "FPL Public API",
        "ok",
        verdict,
        url,
        http_status=http_status,
        rows=len(elements),
        useful_fields=fields,
        missing_for_scouting=missing,
        notes=[f"Normalized CSV sample: {csv_file}"],
        sample_file=sample_file,
        elapsed_ms=elapsed_ms,
    )


def probe_fpl_player_history(player_id: int) -> ProbeResult:
    url = f"https://fantasy.premierleague.com/api/element-summary/{player_id}/"
    try:
        http_status, data, elapsed_ms = fetch_json(url)
    except Exception as exc:
        return ProbeResult("FPL Player History", "failed", "retry", url, notes=[repr(exc)])

    history = data.get("history", [])
    history_past = data.get("history_past", [])
    sample_file = write_sample(
        f"fpl_element_{player_id}_sample",
        {"history": history[:5], "history_past": history_past[:5]},
    )
    first = history[0] if history else {}
    fields = [
        field
        for field in [
            "round",
            "opponent_team",
            "minutes",
            "goals_scored",
            "assists",
            "expected_goals",
            "expected_assists",
            "expected_goal_involvements",
            "expected_goals_conceded",
            "starts",
            "total_points",
        ]
        if field in first
    ]
    return ProbeResult(
        "FPL Player History",
        "ok",
        "useful for player-gameweek time series and past-season summaries",
        url,
        http_status=http_status,
        rows=len(history),
        useful_fields=fields,
        missing_for_scouting=["passing detail", "carries", "pressures", "true event locations"],
        sample_file=sample_file,
        elapsed_ms=elapsed_ms,
    )


def probe_statsbomb() -> ProbeResult:
    url = "https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json"
    try:
        http_status, data, elapsed_ms = fetch_json(url)
    except Exception as exc:
        return ProbeResult("StatsBomb Open Data", "failed", "retry", url, notes=[repr(exc)])

    competitions = [
        item
        for item in data
        if item.get("competition_name") in {"Premier League", "FA Women's Super League", "Champions League", "FIFA World Cup"}
    ]
    sample_file = write_sample("statsbomb_competitions_sample", competitions[:20])
    return ProbeResult(
        "StatsBomb Open Data",
        "ok",
        "excellent event-data sandbox, not complete modern EPL coverage",
        url,
        http_status=http_status,
        rows=len(data),
        useful_fields=[
            "competition_id",
            "season_id",
            "competition_name",
            "season_name",
            "match_updated",
            "match_available_360",
        ],
        missing_for_scouting=["complete current Premier League coverage", "licensed production feed"],
        notes=[f"Relevant competition-season rows in sample filter: {len(competitions)}"],
        sample_file=sample_file,
        elapsed_ms=elapsed_ms,
    )


def probe_understat() -> ProbeResult:
    season = "2025"
    url = f"https://understat.com/getLeagueData/EPL/{season}"
    try:
        http_status, payload, elapsed_ms = fetch_json(
            url,
            headers={
                "Referer": f"https://understat.com/league/EPL/{season}",
                "X-Requested-With": "XMLHttpRequest",
            },
        )
    except urllib.error.HTTPError as exc:
        return ProbeResult("Understat", "failed", "check access or use cached/manual export", url, http_status=exc.code, notes=[exc.reason])
    except Exception as exc:
        return ProbeResult("Understat", "failed", "retry", url, notes=[repr(exc)])

    players = payload.get("players", [])
    sample_file = write_sample("understat_epl_players_sample", players[:10])
    csv_file = write_csv_sample(
        "understat_epl_players_normalized_sample",
        players[:100],
        [
            "id",
            "player_name",
            "games",
            "time",
            "goals",
            "xG",
            "assists",
            "xA",
            "shots",
            "key_passes",
            "position",
            "team_title",
            "npg",
            "npxG",
            "xGChain",
            "xGBuildup",
        ],
    )
    first = players[0] if players else {}
    return ProbeResult(
        "Understat",
        "ok",
        "best free scouting-shaped bridge for EPL xG/xA/shots/key passes since 2014-15, but unofficial",
        url,
        http_status=http_status,
        rows=len(players),
        useful_fields=[field for field in ["player_name", "games", "time", "goals", "xG", "assists", "xA", "shots", "key_passes", "position", "team_title", "npg", "npxG", "xGChain", "xGBuildup"] if field in first],
        missing_for_scouting=["tackles", "interceptions", "clearances", "progressive passes", "carries", "pressures"],
        notes=[
            f"Normalized CSV sample: {csv_file}",
            "Unofficial access: use caching and avoid frequent scraping.",
        ],
        sample_file=sample_file,
        elapsed_ms=elapsed_ms,
    )


def probe_fbref_style() -> ProbeResult:
    url = "https://fbref.com/en/comps/9/stats/Premier-League-Stats"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        start = time.monotonic()
        with urllib.request.urlopen(req, timeout=20) as response:
            html = response.read(250_000).decode("utf-8", errors="ignore")
            elapsed_ms = int((time.monotonic() - start) * 1000)
            http_status = response.status
    except urllib.error.HTTPError as exc:
        return ProbeResult(
            "FBref-Style Public Tables",
            "failed",
            "check access terms or use licensed/exported datasets",
            url,
            http_status=exc.code,
            notes=[exc.reason],
        )
    except Exception as exc:
        return ProbeResult("FBref-Style Public Tables", "failed", "retry", url, notes=[repr(exc)])

    marker_fields = [
        "standard",
        "shooting",
        "passing",
        "passing_types",
        "gca",
        "defense",
        "possession",
        "playingtime",
        "misc",
    ]
    found = [field for field in marker_fields if field in html]
    sample_file = write_sample(
        "fbref_page_probe",
        {
            "url": url,
            "html_prefix": html[:2500],
            "table_markers_found": found,
        },
    )
    return ProbeResult(
        "FBref-Style Public Tables",
        "reachable",
        "excellent schema target, but direct scraping should be treated cautiously for production",
        url,
        http_status=http_status,
        rows=None,
        useful_fields=[
            "standard",
            "shooting",
            "passing",
            "goal and shot creation",
            "defense",
            "possession",
            "playing time",
        ],
        missing_for_scouting=["stable licensed access", "API key or approved export route"],
        notes=[
            f"HTML table markers found: {', '.join(found) if found else 'none in first response chunk'}",
            "Use this as a schema reference unless we confirm permitted data access.",
        ],
        sample_file=sample_file,
        elapsed_ms=elapsed_ms,
    )


def probe_kaggle() -> ProbeResult:
    url = "https://www.kaggle.com/datasets?search=premier+league+player+stats+xg"
    return ProbeResult(
        "Kaggle Public Datasets",
        "manual_review",
        "possible historical CSV source, but dataset freshness and license vary per upload",
        url,
        notes=[
            "Kaggle API/download requires a Kaggle account token and manual dataset choice.",
            "Use only datasets with clear license, season coverage, and field definitions.",
        ],
        missing_for_scouting=["stable API provider", "guaranteed current/live updates", "consistent schema"],
    )


def probe_football_data() -> ProbeResult:
    token = os.environ.get("FOOTBALL_DATA_TOKEN")
    url = "https://api.football-data.org/v4/competitions/PL/teams?season=2025"
    if not token:
        return ProbeResult(
            "football-data.org",
            "needs_key",
            "identity/fixtures/squads only; not enough scouting metrics",
            url,
            notes=["Set FOOTBALL_DATA_TOKEN to test authenticated responses."],
            missing_for_scouting=["xG", "xA", "key passes", "dribbles", "progressive actions", "pressures"],
        )
    try:
        http_status, data, elapsed_ms = fetch_json(url, headers={"X-Auth-Token": token})
    except urllib.error.HTTPError as exc:
        return ProbeResult("football-data.org", "failed", "check_plan_or_key", url, http_status=exc.code, notes=[exc.reason])
    except Exception as exc:
        return ProbeResult("football-data.org", "failed", "retry", url, notes=[repr(exc)])

    teams = data.get("teams", [])
    first = teams[0] if teams else {}
    sample_file = write_sample("football_data_pl_teams_sample", teams[:3])
    return ProbeResult(
        "football-data.org",
        "ok",
        "good reference source for teams, squads, fixtures and player IDs",
        url,
        http_status=http_status,
        rows=len(teams),
        useful_fields=[field for field in ["id", "name", "shortName", "tla", "squad"] if field in first],
        missing_for_scouting=["xG", "xA", "key passes", "carries", "pressures", "per-90 style profile"],
        sample_file=sample_file,
        elapsed_ms=elapsed_ms,
    )


def probe_api_football() -> ProbeResult:
    key_names = ["API_FOOTBALL_KEY", "APISPORTS_KEY", "RAPIDAPI_KEY"]
    present = keys_present(key_names)
    url = "https://v3.football.api-sports.io/players?league=39&season=2025&page=1"
    if not present:
        return ProbeResult(
            "API-FOOTBALL / API-Sports",
            "needs_key",
            "likely best next paid/free-key prototype source for player-season and fixture-player stats",
            url,
            notes=[f"Set one of: {', '.join(key_names)}."],
            missing_for_scouting=["must verify xG/xA availability on your plan"],
        )
    key = os.environ[present[0]]
    headers = {"x-apisports-key": key}
    if present[0] == "RAPIDAPI_KEY":
        headers = {"x-rapidapi-key": key, "x-rapidapi-host": "v3.football.api-sports.io"}
    try:
        http_status, data, elapsed_ms = fetch_json(url, headers=headers)
    except urllib.error.HTTPError as exc:
        return ProbeResult("API-FOOTBALL / API-Sports", "failed", "check_plan_or_key", url, http_status=exc.code, notes=[exc.reason])
    except Exception as exc:
        return ProbeResult("API-FOOTBALL / API-Sports", "failed", "retry", url, notes=[repr(exc)])

    response = data.get("response", [])
    sample_file = write_sample("api_football_players_sample", response[:5])
    first_stats = response[0].get("statistics", [{}])[0] if response else {}
    fields = sorted(first_stats.keys()) if isinstance(first_stats, dict) else []
    return ProbeResult(
        "API-FOOTBALL / API-Sports",
        "ok",
        "strong candidate if plan exposes enough player statistics for PL seasons",
        url,
        http_status=http_status,
        rows=len(response),
        useful_fields=fields,
        missing_for_scouting=["confirm xG/xA", "confirm progressive actions"],
        notes=[f"API paging/errors: {data.get('errors', {})}"],
        sample_file=sample_file,
        elapsed_ms=elapsed_ms,
    )


def probe_sportmonks() -> ProbeResult:
    token = os.environ.get("SPORTMONKS_TOKEN")
    url = "https://api.sportmonks.com/v3/football/players?per_page=5&include=statistics.details.type"
    if not token:
        return ProbeResult(
            "Sportmonks",
            "needs_key",
            "best structured paid candidate; test statistics, transfers, detailed positions, xG includes",
            url,
            notes=["Set SPORTMONKS_TOKEN to test authenticated responses."],
            missing_for_scouting=["must verify Premier League historical depth and xG package"],
        )
    sep = "&" if "?" in url else "?"
    authed_url = f"{url}{sep}{urllib.parse.urlencode({'api_token': token})}"
    try:
        http_status, data, elapsed_ms = fetch_json(authed_url)
    except urllib.error.HTTPError as exc:
        return ProbeResult("Sportmonks", "failed", "check_plan_or_key", url, http_status=exc.code, notes=[exc.reason])
    except Exception as exc:
        return ProbeResult("Sportmonks", "failed", "retry", url, notes=[repr(exc)])

    response = data.get("data", [])
    sample_file = write_sample("sportmonks_players_sample", response[:5])
    first = response[0] if response else {}
    return ProbeResult(
        "Sportmonks",
        "ok",
        "strong paid candidate if subscription includes PL history and expected endpoints",
        url,
        http_status=http_status,
        rows=len(response),
        useful_fields=sorted(first.keys()) if isinstance(first, dict) else [],
        missing_for_scouting=["confirm exact statistic type IDs", "confirm xG endpoint package"],
        sample_file=sample_file,
        elapsed_ms=elapsed_ms,
    )


def result_to_markdown(result: ProbeResult) -> str:
    useful = ", ".join(result.useful_fields) if result.useful_fields else "None confirmed"
    missing = ", ".join(result.missing_for_scouting) if result.missing_for_scouting else "None listed"
    notes = "\n".join(f"- {note}" for note in result.notes) if result.notes else "- No extra notes."
    return f"""## {result.provider}

Status: `{result.status}`

Verdict: {result.verdict}

URL tested: `{result.url}`

HTTP status: `{result.http_status if result.http_status is not None else "not called"}`

Rows observed: `{result.rows if result.rows is not None else "not known"}`

Elapsed: `{result.elapsed_ms if result.elapsed_ms is not None else "not measured"} ms`

Useful fields: {useful}

Missing for scouting: {missing}

Sample file: `{result.sample_file if result.sample_file else "none"}`

Notes:
{notes}
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Test football data source candidates.")
    parser.add_argument("--fpl-player-id", type=int, default=1, help="FPL element id for player history test.")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = [
        probe_fpl(),
        probe_fpl_player_history(args.fpl_player_id),
        probe_understat(),
        probe_statsbomb(),
        probe_fbref_style(),
        probe_kaggle(),
        probe_football_data(),
        probe_api_football(),
        probe_sportmonks(),
    ]

    report = "# Data Source Test Report\n\n" + "\n".join(result_to_markdown(result) for result in results)
    report_path = OUT_DIR / "REPORT.md"
    report_path.write_text(report, encoding="utf-8")
    summary_path = OUT_DIR / "summary.json"
    summary_path.write_text(
        json.dumps([result.__dict__ for result in results], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Wrote {report_path.relative_to(ROOT)}")
    print(f"Wrote {summary_path.relative_to(ROOT)}")
    for result in results:
        print(f"{result.provider}: {result.status} - {result.verdict}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
