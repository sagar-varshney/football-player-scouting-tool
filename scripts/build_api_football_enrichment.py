"""Fetch and normalize API-Football player-season enrichment data.

The integration is intentionally batch-only: the browser never sees the API
key and never calls the provider. Responses are cached locally, a persistent
daily ledger prevents accidental quota overruns, and normalized output is kept
outside version control until coverage and redistribution terms are approved.
"""

from __future__ import annotations

import argparse
import datetime as dt
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

import pandas as pd


ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "api_football"
RAW_DIR = DATA_DIR / "raw" / "players"
NORMALIZED_DIR = DATA_DIR / "normalized"
NORMALIZED_PATH = NORMALIZED_DIR / "epl_player_seasons.csv"
QUALITY_REPORT_PATH = DATA_DIR / "QUALITY_REPORT.md"
LEDGER_PATH = DATA_DIR / "request-ledger.json"

API_BASE_URL = "https://v3.football.api-sports.io"
API_KEY_ENV = "API_FOOTBALL_KEY"
DEFAULT_LEAGUE_ID = 39
DEFAULT_DAILY_BUDGET = 80
DEFAULT_CACHE_HOURS = 168
DEFAULT_PER_MINUTE_LIMIT = 9
DEFAULT_REQUEST_INTERVAL = 1.2


def load_local_env(path: pathlib.Path = ROOT / ".env") -> None:
    """Load simple KEY=VALUE pairs without adding a dotenv dependency."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def atomic_write_json(path: pathlib.Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


@dataclass
class DailyQuota:
    path: pathlib.Path
    budget: int
    per_minute_limit: int = DEFAULT_PER_MINUTE_LIMIT
    min_interval_seconds: float = 0
    used: int = 0
    request_times: list[dt.datetime] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not 1 <= self.budget <= 99:
            raise ValueError("Daily budget must be between 1 and 99 requests.")
        today = utc_now().date().isoformat()
        payload: dict[str, Any] = {}
        if self.path.exists():
            try:
                payload = json.loads(self.path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                payload = {}
        self.used = int(payload.get("used", 0)) if payload.get("date") == today else 0
        if payload.get("date") == today:
            for value in payload.get("request_timestamps", []):
                try:
                    timestamp = dt.datetime.fromisoformat(value)
                    if timestamp.tzinfo is None:
                        timestamp = timestamp.replace(tzinfo=dt.timezone.utc)
                    self.request_times.append(timestamp)
                except (TypeError, ValueError):
                    continue
        self._prune_request_times()
        self._save()

    @property
    def remaining(self) -> int:
        return max(0, self.budget - self.used)

    def consume(self) -> None:
        if self.remaining <= 0:
            raise RuntimeError(
                f"Local API-Football safety budget exhausted ({self.used}/{self.budget}). "
                "Cached pages are safe; continue after the UTC date changes."
            )
        self._wait_for_short_term_capacity()
        # Count before sending so network failures cannot accidentally bypass the cap.
        self.used += 1
        self.request_times.append(utc_now())
        self._save()

    def _prune_request_times(self) -> None:
        cutoff = utc_now() - dt.timedelta(seconds=60)
        self.request_times = [value for value in self.request_times if value > cutoff]

    def _wait_for_short_term_capacity(self) -> None:
        self._prune_request_times()
        now = utc_now()
        waits = [0.0]
        if self.request_times and self.min_interval_seconds > 0:
            elapsed = (now - self.request_times[-1]).total_seconds()
            waits.append(self.min_interval_seconds - elapsed)
        if len(self.request_times) >= self.per_minute_limit:
            rolling_elapsed = (now - self.request_times[0]).total_seconds()
            waits.append(61.0 - rolling_elapsed)
        wait_seconds = max(waits)
        if wait_seconds > 0:
            print(f"  Waiting {wait_seconds:.1f}s for API-Football rate capacity…", flush=True)
            time.sleep(wait_seconds)
            self._prune_request_times()

    def _save(self) -> None:
        atomic_write_json(
            self.path,
            {
                "date": utc_now().date().isoformat(),
                "used": self.used,
                "budget": self.budget,
                "remaining": self.remaining,
                "updated_at": utc_now().isoformat(),
                "request_timestamps": [value.isoformat() for value in self.request_times],
            },
        )


def cache_is_fresh(path: pathlib.Path, cache_hours: int) -> bool:
    if not path.exists() or cache_hours <= 0:
        return False
    age_seconds = time.time() - path.stat().st_mtime
    return age_seconds <= cache_hours * 3600


def request_json(url: str, api_key: str, quota: DailyQuota, timeout: int = 30) -> dict[str, Any]:
    quota.consume()
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "FootballPlayerScoutingTool/1.0",
            "x-apisports-key": api_key,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"API-Football returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach API-Football: {exc.reason}") from exc

    errors = payload.get("errors")
    if errors:
        raise RuntimeError(f"API-Football rejected the request: {errors}")
    return payload


def page_cache_path(season: int, page: int, team_id: int | None = None) -> pathlib.Path:
    if team_id is not None:
        return RAW_DIR / "by-team" / str(season) / str(team_id) / f"page-{page:03d}.json"
    return RAW_DIR / "by-league" / str(season) / f"page-{page:03d}.json"


def legacy_page_cache_path(season: int, page: int) -> pathlib.Path:
    """Read caches created before fetch strategies were separated."""
    return RAW_DIR / str(season) / f"page-{page:03d}.json"


def load_or_fetch_page(
    *,
    season: int,
    page: int,
    league_id: int,
    api_key: str | None,
    quota: DailyQuota,
    cache_hours: int,
    force: bool,
    team_id: int | None = None,
) -> tuple[dict[str, Any], bool]:
    path = page_cache_path(season, page, team_id)
    legacy_path = legacy_page_cache_path(season, page) if team_id is None else None
    if legacy_path and legacy_path.exists() and not path.exists():
        path = legacy_path
    if path.exists() and not force and cache_is_fresh(path, cache_hours):
        return json.loads(path.read_text(encoding="utf-8")), True
    if api_key is None:
        if path.exists() and not force:
            return json.loads(path.read_text(encoding="utf-8")), True
        raise RuntimeError(
            f"{API_KEY_ENV} is not set and cached page {path.relative_to(ROOT)} is unavailable."
        )

    parameters = {"league": league_id, "season": season, "page": page}
    if team_id is not None:
        parameters["team"] = team_id
    query = urllib.parse.urlencode(parameters)
    payload = request_json(f"{API_BASE_URL}/players?{query}", api_key, quota)
    atomic_write_json(path, payload)
    return payload, False


def fetch_player_scope(
    *,
    season: int,
    league_id: int,
    api_key: str | None,
    quota: DailyQuota,
    cache_hours: int,
    force: bool,
    max_pages: int | None,
    team_id: int | None = None,
) -> tuple[list[dict[str, Any]], int, int, int]:
    first, first_cached = load_or_fetch_page(
        season=season,
        page=1,
        league_id=league_id,
        api_key=api_key,
        quota=quota,
        cache_hours=cache_hours,
        force=force,
        team_id=team_id,
    )
    total_pages = int(first.get("paging", {}).get("total") or 1)
    pages_to_read = min(total_pages, max_pages) if max_pages else total_pages
    records = list(first.get("response") or [])
    cached_pages = int(first_cached)

    for page in range(2, pages_to_read + 1):
        payload, was_cached = load_or_fetch_page(
            season=season,
            page=page,
            league_id=league_id,
            api_key=api_key,
            quota=quota,
            cache_hours=cache_hours,
            force=force,
            team_id=team_id,
        )
        records.extend(payload.get("response") or [])
        cached_pages += int(was_cached)

    omitted_pages = max(0, total_pages - pages_to_read)
    return records, pages_to_read, cached_pages, omitted_pages


def teams_cache_path(season: int) -> pathlib.Path:
    return DATA_DIR / "raw" / "teams" / f"{season}.json"


def load_or_fetch_teams(
    *,
    season: int,
    league_id: int,
    api_key: str | None,
    quota: DailyQuota,
    cache_hours: int,
    force: bool,
) -> tuple[list[dict[str, Any]], bool]:
    path = teams_cache_path(season)
    if path.exists() and not force and cache_is_fresh(path, cache_hours):
        payload = json.loads(path.read_text(encoding="utf-8"))
        return list(payload.get("response") or []), True
    if api_key is None:
        if path.exists() and not force:
            payload = json.loads(path.read_text(encoding="utf-8"))
            return list(payload.get("response") or []), True
        raise RuntimeError(
            f"{API_KEY_ENV} is not set and cached team list {path.relative_to(ROOT)} is unavailable."
        )

    query = urllib.parse.urlencode({"league": league_id, "season": season})
    payload = request_json(f"{API_BASE_URL}/teams?{query}", api_key, quota)
    atomic_write_json(path, payload)
    return list(payload.get("response") or []), False


def fetch_season_by_teams(
    *,
    season: int,
    league_id: int,
    api_key: str | None,
    quota: DailyQuota,
    cache_hours: int,
    force: bool,
    max_pages: int | None,
) -> tuple[list[dict[str, Any]], int, int, int]:
    teams, teams_cached = load_or_fetch_teams(
        season=season,
        league_id=league_id,
        api_key=api_key,
        quota=quota,
        cache_hours=cache_hours,
        force=force,
    )
    if not teams:
        raise RuntimeError(f"API-Football returned no teams for {season_label(season)}.")

    records: list[dict[str, Any]] = []
    total_pages = 0
    cached_pages = int(teams_cached)
    omitted_pages = 0
    for item in teams:
        team = item.get("team") or {}
        team_id = int(team["id"])
        team_name = str(team.get("name") or team_id)
        team_records, pages, team_cached_pages, team_omitted_pages = fetch_player_scope(
            season=season,
            league_id=league_id,
            api_key=api_key,
            quota=quota,
            cache_hours=cache_hours,
            force=force,
            max_pages=max_pages,
            team_id=team_id,
        )
        records.extend(team_records)
        total_pages += pages
        cached_pages += team_cached_pages
        omitted_pages += team_omitted_pages
        omission_note = f", {team_omitted_pages} unavailable page(s) omitted" if team_omitted_pages else ""
        print(f"  {team_name}: {len(team_records)} player rows from {pages} page(s){omission_note}")
    return records, total_pages, cached_pages, omitted_pages


def to_number(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    if isinstance(value, str):
        value = value.strip().removesuffix("%")
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def per_90(value: Any, minutes: Any) -> float | None:
    amount = to_number(value)
    played = to_number(minutes)
    if amount is None or played is None or played <= 0:
        return None
    return round(amount * 90 / played, 4)


def season_label(start_year: int) -> str:
    return f"{start_year}-{start_year + 1}"


def normalize_position(raw: Any) -> str:
    return {
        "Goalkeeper": "Goalkeeper",
        "Defender": "Defender",
        "Midfielder": "Midfielder",
        "Attacker": "Forward",
    }.get(str(raw or ""), str(raw or "Unknown"))


def normalized_rows(records: list[dict[str, Any]], season: int, league_id: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in records:
        player = item.get("player") or {}
        for statistics in item.get("statistics") or []:
            league = statistics.get("league") or {}
            if league.get("id") not in (None, league_id):
                continue
            team = statistics.get("team") or {}
            games = statistics.get("games") or {}
            shots = statistics.get("shots") or {}
            goals = statistics.get("goals") or {}
            passes = statistics.get("passes") or {}
            tackles = statistics.get("tackles") or {}
            duels = statistics.get("duels") or {}
            dribbles = statistics.get("dribbles") or {}
            fouls = statistics.get("fouls") or {}
            cards = statistics.get("cards") or {}
            penalty = statistics.get("penalty") or {}
            minutes = to_number(games.get("minutes"))

            row = {
                "api_football_player_id": player.get("id"),
                "player_name": player.get("name"),
                "firstname": player.get("firstname"),
                "lastname": player.get("lastname"),
                "age": to_number(player.get("age")),
                "nationality": player.get("nationality"),
                "height": player.get("height"),
                "weight": player.get("weight"),
                "injured": player.get("injured"),
                "photo_url": player.get("photo"),
                "season": season_label(season),
                "league_id": league.get("id") or league_id,
                "competition": league.get("name") or "Premier League",
                "team_id": team.get("id"),
                "club": team.get("name"),
                "position_raw": games.get("position"),
                "position": normalize_position(games.get("position")),
                "appearances": to_number(games.get("appearences")),
                "starts": to_number(games.get("lineups")),
                "minutes": minutes,
                "rating": to_number(games.get("rating")),
                "shots": to_number(shots.get("total")),
                "shots_on_target": to_number(shots.get("on")),
                "goals": to_number(goals.get("total")),
                "assists": to_number(goals.get("assists")),
                "passes": to_number(passes.get("total")),
                "key_passes": to_number(passes.get("key")),
                # The provider names this field `accuracy`, but season responses
                # behave like an average count rather than a percentage. Keep
                # the value for inspection without claiming percentage semantics.
                "passes_accuracy_value": to_number(passes.get("accuracy")),
                "tackles": to_number(tackles.get("total")),
                "blocks": to_number(tackles.get("blocks")),
                "interceptions": to_number(tackles.get("interceptions")),
                "duels": to_number(duels.get("total")),
                "duels_won": to_number(duels.get("won")),
                "dribbles_attempted": to_number(dribbles.get("attempts")),
                "dribbles_completed": to_number(dribbles.get("success")),
                "fouls_drawn": to_number(fouls.get("drawn")),
                "fouls_committed": to_number(fouls.get("committed")),
                "yellow_cards": to_number(cards.get("yellow")),
                "red_cards": to_number(cards.get("red")),
                "penalties_won": to_number(penalty.get("won")),
                "penalties_committed": to_number(penalty.get("commited")),
                "source_provider": "api-football",
            }
            row["tackles_interceptions"] = (
                row["tackles"] + row["interceptions"]
                if row["tackles"] is not None and row["interceptions"] is not None
                else None
            )
            for field in [
                "shots",
                "passes",
                "key_passes",
                "tackles",
                "blocks",
                "interceptions",
                "tackles_interceptions",
                "duels",
                "duels_won",
                "dribbles_attempted",
                "dribbles_completed",
                "fouls_drawn",
                "fouls_committed",
            ]:
                row[f"{field}_p90"] = per_90(row[field], minutes)
            rows.append(row)
    return rows


def combine_duplicate_rows(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame
    keys = ["api_football_player_id", "season", "team_id"]
    # Provider pagination can occasionally repeat a player. Retain the row with
    # the most minutes rather than adding season totals twice.
    return (
        frame.sort_values("minutes", ascending=False, na_position="last")
        .drop_duplicates(keys, keep="first")
        .sort_values(["season", "club", "player_name"])
        .reset_index(drop=True)
    )


def coverage_percentage(frame: pd.DataFrame, column: str) -> float:
    if frame.empty or column not in frame:
        return 0.0
    return round(float(frame[column].notna().mean() * 100), 1)


def write_quality_report(
    frame: pd.DataFrame,
    *,
    seasons: list[int],
    min_minutes: int,
    quota: DailyQuota,
    page_summary: list[dict[str, int]],
) -> None:
    eligible = frame[frame["minutes"].fillna(0) >= min_minutes].copy()
    fields = [
        "minutes",
        "passes_accuracy_value",
        "tackles_p90",
        "interceptions_p90",
        "tackles_interceptions_p90",
        "duels_p90",
        "duels_won_p90",
        "dribbles_completed_p90",
        "blocks_p90",
    ]
    coverage_lines = "\n".join(
        f"| `{field}` | {coverage_percentage(eligible, field):.1f}% |" for field in fields
    )
    pages = sum(item["pages"] for item in page_summary)
    cached = sum(item["cached_pages"] for item in page_summary)
    omitted = sum(item["omitted_pages"] for item in page_summary)
    completeness = "PARTIAL — provider page cap omitted data" if omitted else "Complete for requested scopes"
    report = f"""# API-Football Enrichment Quality Report

Generated at {utc_now().isoformat()}.

## Fetch summary

- Seasons: {", ".join(season_label(year) for year in seasons)}
- Normalized rows: {len(frame)}
- Players: {frame["api_football_player_id"].nunique() if not frame.empty else 0}
- Rows with at least {min_minutes} minutes: {len(eligible)}
- Pages processed: {pages}
- Responses served from cache: {cached}
- Provider pages omitted: {omitted}
- Collection status: {completeness}
- Requests counted today: {quota.used}/{quota.budget}
- Local requests remaining: {quota.remaining}

## Eligible-row field coverage

| Field | Non-null coverage |
| --- | ---: |
{coverage_lines}

## Activation rule

Do not add an API-Football field to similarity until the collection is complete
and it has at least 80% non-null coverage for the relevant season and position.
Zero is a valid football value; missing values remain null so unavailable
provider data is not mistaken for zero.

## Source boundary

This report verifies technical completeness, not redistribution rights or
scouting accuracy. Review the provider terms before publishing normalized data.
"""
    QUALITY_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    QUALITY_REPORT_PATH.write_text(report, encoding="utf-8")


def parse_seasons(raw: str) -> list[int]:
    seasons = sorted({int(value.strip()) for value in raw.split(",") if value.strip()})
    if not seasons:
        raise ValueError("At least one season start year is required.")
    return seasons


def main() -> int:
    load_local_env()
    parser = argparse.ArgumentParser(
        description="Build a cached, quota-safe API-Football EPL enrichment dataset."
    )
    parser.add_argument("--seasons", default="2024", help="Comma-separated start years, for example 2023,2024")
    parser.add_argument("--league-id", type=int, default=DEFAULT_LEAGUE_ID)
    parser.add_argument("--daily-budget", type=int, default=int(os.environ.get("API_FOOTBALL_DAILY_BUDGET", DEFAULT_DAILY_BUDGET)))
    parser.add_argument("--cache-hours", type=int, default=DEFAULT_CACHE_HOURS)
    parser.add_argument("--min-minutes", type=int, default=450)
    parser.add_argument(
        "--per-minute-limit",
        type=int,
        default=DEFAULT_PER_MINUTE_LIMIT,
        help="Rolling local request cap; defaults to 9 per minute",
    )
    parser.add_argument(
        "--request-interval",
        type=float,
        default=DEFAULT_REQUEST_INTERVAL,
        help="Minimum seconds between network requests",
    )
    parser.add_argument(
        "--strategy",
        choices=["teams", "league"],
        default="teams",
        help="Use team paging for broader free-plan coverage; league is useful for a one-page probe",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=3,
        help="Pages per scope; defaults to the free-plan maximum of 3 (use 0 for unlimited)",
    )
    parser.add_argument("--force", action="store_true", help="Refresh even when cached pages are fresh")
    parser.add_argument("--normalize-only", action="store_true", help="Read cached pages without making network requests")
    args = parser.parse_args()

    seasons = parse_seasons(args.seasons)
    quota = DailyQuota(
        LEDGER_PATH,
        args.daily_budget,
        per_minute_limit=args.per_minute_limit,
        min_interval_seconds=args.request_interval,
    )
    api_key = None if args.normalize_only else os.environ.get(API_KEY_ENV)
    if api_key is not None:
        api_key = api_key.strip() or None
        if api_key and api_key.lower().startswith("replace_with_"):
            api_key = None

    all_rows: list[dict[str, Any]] = []
    page_summary: list[dict[str, int]] = []
    try:
        for season in seasons:
            fetcher = fetch_season_by_teams if args.strategy == "teams" else fetch_player_scope
            records, pages, cached_pages, omitted_pages = fetcher(
                season=season,
                league_id=args.league_id,
                api_key=api_key,
                quota=quota,
                cache_hours=args.cache_hours,
                force=args.force,
                max_pages=args.max_pages,
            )
            all_rows.extend(normalized_rows(records, season, args.league_id))
            page_summary.append(
                {
                    "season": season,
                    "pages": pages,
                    "cached_pages": cached_pages,
                    "omitted_pages": omitted_pages,
                }
            )
            print(
                f"{season_label(season)}: {len(records)} provider rows from {pages} page(s) "
                f"({cached_pages} cached, {omitted_pages} unavailable page(s) omitted)"
            )
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        print(f"Quota ledger: {quota.used}/{quota.budget} requests used today (UTC).", file=sys.stderr)
        return 2

    if not all_rows:
        print("Error: API-Football returned no player statistics for the requested season(s).", file=sys.stderr)
        return 2

    frame = combine_duplicate_rows(pd.DataFrame(all_rows))
    NORMALIZED_DIR.mkdir(parents=True, exist_ok=True)
    frame.to_csv(NORMALIZED_PATH, index=False)
    write_quality_report(
        frame,
        seasons=seasons,
        min_minutes=args.min_minutes,
        quota=quota,
        page_summary=page_summary,
    )
    print(f"Wrote {NORMALIZED_PATH.relative_to(ROOT)} ({len(frame)} rows)")
    print(f"Wrote {QUALITY_REPORT_PATH.relative_to(ROOT)}")
    print(f"Local quota remaining today: {quota.remaining}/{quota.budget}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
