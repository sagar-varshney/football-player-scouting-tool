"""Build inspectable free football datasets for the scouting engine.

Primary source:
- Understat EPL player-season rows for xG/xA/shots/key-pass style metrics.

Supplement:
- Fantasy Premier League current-player metadata and availability.

Outputs are written to `data/free_data/`. The normalized Understat dataset is
then exported to the production web application by `export_free_frontend_data.py`.
"""

from __future__ import annotations

import argparse
import json
import pathlib
from typing import Any

import pandas as pd

from test_data_sources import fetch_json


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "free_data"


UNDERSTAT_COLUMNS = [
    "provider_player_id",
    "player_name",
    "season",
    "competition",
    "club",
    "position_raw",
    "position",
    "matches",
    "minutes",
    "goals",
    "xg",
    "non_penalty_goals",
    "non_penalty_xg",
    "assists",
    "xa",
    "shots",
    "key_passes",
    "xg_chain",
    "xg_buildup",
    "goals_p90",
    "xg_p90",
    "assists_p90",
    "xa_p90",
    "shots_p90",
    "key_passes_p90",
    "xg_chain_p90",
    "xg_buildup_p90",
    "source_provider",
]


FPL_COLUMNS = [
    "fpl_player_id",
    "opta_code",
    "player_name",
    "web_name",
    "club",
    "position",
    "minutes",
    "starts",
    "goals",
    "assists",
    "xg",
    "xa",
    "xg_p90",
    "xa_p90",
    "expected_goal_involvements",
    "expected_goal_involvements_p90",
    "clearances_blocks_interceptions",
    "recoveries",
    "tackles",
    "defensive_contribution",
    "influence",
    "creativity",
    "threat",
    "form",
    "selected_by_percent",
    "now_cost",
    "status",
    "birth_date",
    "news",
    "news_added",
    "chance_of_playing_next_round",
    "chance_of_playing_this_round",
    "source_provider",
]


def to_float(value: Any) -> float:
    if value in ("", None):
        return 0.0
    return float(value)


def to_int(value: Any) -> int:
    if value in ("", None):
        return 0
    return int(float(value))


def per90(value: float, minutes: int) -> float:
    if minutes <= 0:
        return 0.0
    return round(value * 90 / minutes, 4)


def season_label(start_year: int) -> str:
    return f"{start_year}-{start_year + 1}"


def map_understat_position(raw: str) -> str:
    tokens = set((raw or "").split())
    if "GK" in tokens:
        return "Goalkeeper"
    if "D" in tokens and not {"F", "M"} & tokens:
        return "Defender"
    if "F" in tokens and "M" in tokens:
        return "Winger"
    if "F" in tokens:
        return "Forward"
    if "M" in tokens:
        return "Midfielder"
    if "D" in tokens:
        return "Defender"
    return "Unknown"


def fetch_understat_season(start_year: int) -> list[dict[str, Any]]:
    url = f"https://understat.com/getLeagueData/EPL/{start_year}"
    _, payload, _ = fetch_json(
        url,
        headers={
            "Referer": f"https://understat.com/league/EPL/{start_year}",
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    players = payload.get("players", [])
    if not isinstance(players, list):
        raise ValueError(f"Understat payload for {start_year} did not contain a players list.")
    return players


def normalize_understat_player(row: dict[str, Any], start_year: int) -> dict[str, Any]:
    minutes = to_int(row.get("time"))
    goals = to_float(row.get("goals"))
    xg = to_float(row.get("xG"))
    assists = to_float(row.get("assists"))
    xa = to_float(row.get("xA"))
    shots = to_float(row.get("shots"))
    key_passes = to_float(row.get("key_passes"))
    xg_chain = to_float(row.get("xGChain"))
    xg_buildup = to_float(row.get("xGBuildup"))
    raw_position = str(row.get("position") or "")

    return {
        "provider_player_id": row.get("id"),
        "player_name": row.get("player_name"),
        "season": season_label(start_year),
        "competition": "ENG-Premier League",
        "club": row.get("team_title"),
        "position_raw": raw_position,
        "position": map_understat_position(raw_position),
        "matches": to_int(row.get("games")),
        "minutes": minutes,
        "goals": goals,
        "xg": round(xg, 4),
        "non_penalty_goals": to_float(row.get("npg")),
        "non_penalty_xg": round(to_float(row.get("npxG")), 4),
        "assists": assists,
        "xa": round(xa, 4),
        "shots": shots,
        "key_passes": key_passes,
        "xg_chain": round(xg_chain, 4),
        "xg_buildup": round(xg_buildup, 4),
        "goals_p90": per90(goals, minutes),
        "xg_p90": per90(xg, minutes),
        "assists_p90": per90(assists, minutes),
        "xa_p90": per90(xa, minutes),
        "shots_p90": per90(shots, minutes),
        "key_passes_p90": per90(key_passes, minutes),
        "xg_chain_p90": per90(xg_chain, minutes),
        "xg_buildup_p90": per90(xg_buildup, minutes),
        "source_provider": "understat",
    }


def build_understat_dataset(start_years: list[int], min_minutes: int) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for year in start_years:
        for player in fetch_understat_season(year):
            normalized = normalize_understat_player(player, year)
            if normalized["minutes"] >= min_minutes and normalized["position"] != "Goalkeeper":
                rows.append(normalized)
    df = pd.DataFrame(rows, columns=UNDERSTAT_COLUMNS)
    return df.sort_values(["season", "position", "player_name"]).reset_index(drop=True)


def map_fpl_position(element_type: int) -> str:
    return {
        1: "Goalkeeper",
        2: "Defender",
        3: "Midfielder",
        4: "Forward",
    }.get(element_type, "Unknown")


def build_fpl_dataset() -> pd.DataFrame:
    _, payload, _ = fetch_json("https://fantasy.premierleague.com/api/bootstrap-static/")
    teams = {team["id"]: team["name"] for team in payload.get("teams", [])}
    rows: list[dict[str, Any]] = []
    for player in payload.get("elements", []):
        first_name = player.get("first_name") or ""
        second_name = player.get("second_name") or ""
        minutes = to_int(player.get("minutes"))
        rows.append(
            {
                "fpl_player_id": player.get("id"),
                "opta_code": player.get("opta_code"),
                "player_name": f"{first_name} {second_name}".strip() or player.get("web_name"),
                "web_name": player.get("web_name"),
                "club": teams.get(player.get("team"), player.get("team")),
                "position": map_fpl_position(to_int(player.get("element_type"))),
                "minutes": minutes,
                "starts": to_int(player.get("starts")),
                "goals": to_float(player.get("goals_scored")),
                "assists": to_float(player.get("assists")),
                "xg": to_float(player.get("expected_goals")),
                "xa": to_float(player.get("expected_assists")),
                "xg_p90": to_float(player.get("expected_goals_per_90")),
                "xa_p90": to_float(player.get("expected_assists_per_90")),
                "expected_goal_involvements": to_float(player.get("expected_goal_involvements")),
                "expected_goal_involvements_p90": to_float(player.get("expected_goal_involvements_per_90")),
                "clearances_blocks_interceptions": to_int(player.get("clearances_blocks_interceptions")),
                "recoveries": to_int(player.get("recoveries")),
                "tackles": to_int(player.get("tackles")),
                "defensive_contribution": to_int(player.get("defensive_contribution")),
                "influence": to_float(player.get("influence")),
                "creativity": to_float(player.get("creativity")),
                "threat": to_float(player.get("threat")),
                "form": to_float(player.get("form")),
                "selected_by_percent": to_float(player.get("selected_by_percent")),
                "now_cost": to_int(player.get("now_cost")) / 10,
                "status": player.get("status"),
                "birth_date": player.get("birth_date"),
                "news": player.get("news") or "",
                "news_added": player.get("news_added"),
                "chance_of_playing_next_round": player.get("chance_of_playing_next_round"),
                "chance_of_playing_this_round": player.get("chance_of_playing_this_round"),
                "source_provider": "fpl",
            }
        )
    return pd.DataFrame(rows, columns=FPL_COLUMNS).sort_values(["club", "position", "player_name"]).reset_index(drop=True)


def null_report(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.isna()
        .mean()
        .mul(100)
        .round(2)
        .rename("null_pct")
        .reset_index()
        .rename(columns={"index": "column"})
    )


def markdown_table(df: pd.DataFrame) -> str:
    if df.empty:
        return "_No rows._"
    display = df.reset_index() if df.index.name or not isinstance(df.index, pd.RangeIndex) else df.copy()
    columns = [str(column) for column in display.columns]
    lines = [
        "| " + " | ".join(columns) + " |",
        "| " + " | ".join("---" for _ in columns) + " |",
    ]
    for _, row in display.iterrows():
        values = [str(row[column]).replace("|", "\\|") for column in display.columns]
        lines.append("| " + " | ".join(values) + " |")
    return "\n".join(lines)


def write_quality_report(understat: pd.DataFrame, fpl: pd.DataFrame, start_years: list[int], min_minutes: int) -> pathlib.Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = OUT_DIR / "QUALITY_REPORT.md"
    top_understat = understat.sort_values("xg_p90", ascending=False).head(10)[
        ["player_name", "season", "club", "position", "minutes", "goals_p90", "xg_p90", "xa_p90", "shots_p90", "key_passes_p90"]
    ]
    position_counts = understat.groupby(["season", "position"]).size().unstack(fill_value=0)

    report = f"""# Free Data Quality Report

Generated from free sources.

## Understat

- Seasons requested: {", ".join(season_label(year) for year in start_years)}
- Minimum minutes filter: {min_minutes}
- Rows after filter: {len(understat)}
- Unique players: {understat["player_name"].nunique()}
- Clubs/club strings: {understat["club"].nunique()}
- Source role: primary real scouting-shaped player-season stats.

### Position Counts

{markdown_table(position_counts)}

### Top xG / 90 Sample

{markdown_table(top_understat.reset_index(drop=True))}

### Understat Null Rate

{markdown_table(null_report(understat))}

## FPL

- Rows: {len(fpl)}
- Unique players: {fpl["player_name"].nunique()}
- Clubs: {fpl["club"].nunique()}
- Source role: current Premier League metadata, availability, minutes, and fantasy-facing current stats.

### FPL Null Rate

{markdown_table(null_report(fpl))}

## Verdict

Use Understat as the first replacement for generated attacking and creative metrics. Use FPL as a supplement for current squad context and availability. This is free and usable, but it is still not a complete defensive/carrying/pressure scouting dataset.
"""
    report_path.write_text(report, encoding="utf-8")
    return report_path


def parse_years(raw: str) -> list[int]:
    if "-" in raw and "," not in raw:
        start, end = raw.split("-", 1)
        return list(range(int(start), int(end) + 1))
    return [int(item.strip()) for item in raw.split(",") if item.strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build normalized free football data samples.")
    parser.add_argument("--understat-seasons", default="2021-2025", help="Start years, e.g. 2021-2025 or 2021,2022,2023")
    parser.add_argument("--min-minutes", type=int, default=450)
    parser.add_argument("--fpl-only", action="store_true", help="Refresh FPL context while preserving the cached Understat dataset.")
    args = parser.parse_args()

    start_years = parse_years(args.understat_seasons)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    understat_path = OUT_DIR / "understat_epl_player_seasons.csv"
    if args.fpl_only:
        if not understat_path.exists():
            raise FileNotFoundError(f"Missing {understat_path}; a full build is required first.")
        understat = pd.read_csv(understat_path)
        start_years = sorted({int(str(season).split("-", 1)[0]) for season in understat["season"].unique()})
    else:
        understat = build_understat_dataset(start_years, min_minutes=args.min_minutes)
    fpl = build_fpl_dataset()

    fpl_path = OUT_DIR / "fpl_current_players.csv"
    if not args.fpl_only:
        understat.to_csv(understat_path, index=False)
    fpl.to_csv(fpl_path, index=False)

    metadata = {
        "understat_rows": len(understat),
        "understat_unique_players": int(understat["player_name"].nunique()),
        "understat_seasons": [season_label(year) for year in start_years],
        "understat_min_minutes": args.min_minutes,
        "fpl_rows": len(fpl),
        "fpl_unique_players": int(fpl["player_name"].nunique()),
        "outputs": {
            "understat": str(understat_path.relative_to(ROOT)),
            "fpl": str(fpl_path.relative_to(ROOT)),
            "quality_report": "data/free_data/QUALITY_REPORT.md",
        },
    }
    (OUT_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    report_path = write_quality_report(understat, fpl, start_years, args.min_minutes)

    action = "Preserved" if args.fpl_only else "Wrote"
    print(f"{action} {understat_path.relative_to(ROOT)} ({len(understat)} rows)")
    print(f"Wrote {fpl_path.relative_to(ROOT)} ({len(fpl)} rows)")
    print(f"Wrote {report_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
