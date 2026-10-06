"""Build a compact EPL action-location lab from StatsBomb Open Data.

StatsBomb's repository contains event data for selected competitions. The
current free EPL release covers 2015/16 (plus 2003/04), so this dataset is kept
separate from the current Understat scouting model. Each player is written to a
small lazy-loaded JSON file and the manifest drives the frontend selector.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import pathlib
import time
import urllib.request
from collections import defaultdict


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "frontend" / "public" / "event-lab"
RAW_BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
USER_AGENT = "FootballPlayerScoutingTool/1.0 (+StatsBomb Open Data)"
COMPETITION_ID = 2
SEASON_ID = 27
SEASON_NAME = "2015/2016"

# Location-bearing, player-attributed football actions. We deliberately call
# these actions rather than touches: the open event feed is not a touch stream.
ON_BALL_TYPES = {
    "Ball Receipt*",
    "Ball Recovery",
    "Carry",
    "Clearance",
    "Dispossessed",
    "Dribble",
    "Duel",
    "Goal Keeper",
    "Interception",
    "Miscontrol",
    "Pass",
    "Shot",
}


def fetch_json(url: str, attempts: int = 3) -> object:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except (OSError, ValueError) as exc:
            error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Unable to fetch {url}: {error!r}")


def compact_event(event: dict, match_id: int) -> dict | None:
    location = event.get("location")
    player = event.get("player")
    event_type = event.get("type", {}).get("name")
    if not location or not player or event_type not in ON_BALL_TYPES:
        return None
    return {
        "player_id": int(player["id"]),
        "player_name": player["name"],
        "team": event.get("team", {}).get("name", "Unknown"),
        # Tuple layout keeps more than a million open events practical to
        # version and serve: [normalized x, normalized y, type, match id].
        "action": [
            round(float(location[0]) / 120, 4),
            round(float(location[1]) / 80, 4),
            event_type,
            match_id,
        ],
    }


def fetch_match(match: dict) -> tuple[int, list[dict]]:
    match_id = int(match["match_id"])
    events = fetch_json(f"{RAW_BASE}/events/{match_id}.json")
    return match_id, [item for event in events if (item := compact_event(event, match_id))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit", type=int, help="Only process the first N matches")
    args = parser.parse_args()

    matches = fetch_json(f"{RAW_BASE}/matches/{COMPETITION_ID}/{SEASON_ID}.json")
    if args.limit:
        matches = matches[: args.limit]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    player_actions: dict[int, list[dict]] = defaultdict(list)
    player_names: dict[int, str] = {}
    player_teams: dict[int, set[str]] = defaultdict(set)
    failures: list[str] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        future_map = {executor.submit(fetch_match, match): int(match["match_id"]) for match in matches}
        for index, future in enumerate(concurrent.futures.as_completed(future_map), start=1):
            match_id = future_map[future]
            try:
                _, rows = future.result()
                for row in rows:
                    player_id = row["player_id"]
                    player_names[player_id] = row["player_name"]
                    player_teams[player_id].add(row["team"])
                    player_actions[player_id].append(row["action"])
            except Exception as error:
                failures.append(f"{match_id}: {error!r}")
            if index % 25 == 0 or index == len(future_map):
                print(f"{index}/{len(future_map)} matches · {len(player_actions)} players · {len(failures)} failed")

    players = []
    for player_id, actions in player_actions.items():
        actions.sort(key=lambda item: item[3])
        payload = {
            "player_id": player_id,
            "player_name": player_names[player_id],
            "teams": sorted(player_teams[player_id]),
            "competition": "Premier League",
            "season": SEASON_NAME,
            "source": "StatsBomb Open Data",
            "data_label": "Recorded on-ball actions (not touches)",
            "actions": actions,
        }
        (OUTPUT_DIR / f"{player_id}.json").write_text(
            json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8"
        )
        players.append(
            {
                "player_id": player_id,
                "player_name": player_names[player_id],
                "teams": sorted(player_teams[player_id]),
                "actions": len(actions),
            }
        )

    players.sort(key=lambda player: (-player["actions"], player["player_name"]))
    manifest = {
        "source": "StatsBomb Open Data",
        "competition": "Premier League",
        "season": SEASON_NAME,
        "competition_id": COMPETITION_ID,
        "season_id": SEASON_ID,
        "matches": len(matches) - len(failures),
        "players": players,
        "failed_matches": failures,
        "note": "Open event coverage is historical and intentionally separate from the current Understat model.",
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(players)} player action files and {sum(len(v) for v in player_actions.values())} actions")


if __name__ == "__main__":
    main()
