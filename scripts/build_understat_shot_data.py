"""Build compact, per-player Understat shot-location files for the web app.

The scouting dataset already contains Understat player IDs. This script fetches
each unique player once, keeps only EPL seasons represented in the local model,
and writes small lazy-loadable JSON files under ``frontend/public/shot-data``.

Run after ``build_free_data.py``. Existing files are reused by default so the
script is safe to resume after an interrupted download.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

import pandas as pd


ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from src.display_names import preferred_player_name

INPUT_PATH = ROOT / "data" / "free_data" / "understat_epl_player_seasons.csv"
OUTPUT_DIR = ROOT / "frontend" / "public" / "shot-data"
ENDPOINT = "https://understat.com/getPlayerData/{player_id}"
USER_AGENT = "PlayerScoutingTool/0.2 (+local, non-commercial data cache)"


def season_label(start_year: int) -> str:
    return f"{start_year}-{start_year + 1}"


def compact_shot(shot: dict) -> dict:
    return {
        "season": season_label(int(shot["season"])),
        "x": round(float(shot["X"]), 4),
        "y": round(float(shot["Y"]), 4),
        "xg": round(float(shot.get("xG", 0)), 4),
        "result": shot.get("result", "Unknown"),
        "minute": int(shot.get("minute", 0)),
        "situation": shot.get("situation", "Unknown"),
        "shot_type": shot.get("shotType", "Unknown"),
    }


def fetch_player(player_id: int, player_name: str, seasons: set[str], force: bool) -> tuple[str, int, str]:
    destination = OUTPUT_DIR / f"{player_id}.json"
    if destination.exists() and not force:
        try:
            cached = json.loads(destination.read_text(encoding="utf-8"))
            return "cached", len(cached.get("shots", [])), player_name
        except (json.JSONDecodeError, OSError):
            pass

    request = urllib.request.Request(
        ENDPOINT.format(player_id=player_id),
        headers={
            "User-Agent": USER_AGENT,
            "Referer": "https://understat.com/",
            "X-Requested-With": "XMLHttpRequest",
            "Accept-Encoding": "gzip",
        },
    )

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                raw = response.read()
                if response.headers.get("Content-Encoding", "").lower() == "gzip":
                    import gzip

                    raw = gzip.decompress(raw)
                payload = json.loads(raw.decode("utf-8"))
            shots = [
                compact_shot(shot)
                for shot in payload.get("shots", [])
                if season_label(int(shot["season"])) in seasons
            ]
            result = {
                "player_id": player_id,
                "player_name": preferred_player_name(
                    payload.get("player", {}).get("name", player_name),
                    player_id,
                ),
                "source": "Understat",
                "coordinate_note": "Normalized attacking-direction shot locations; not player touches.",
                "shots": shots,
            }
            temporary = destination.with_suffix(".tmp")
            temporary.write_text(json.dumps(result, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
            temporary.replace(destination)
            return "downloaded", len(shots), player_name
        except (OSError, ValueError, KeyError, urllib.error.URLError) as error:
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    return "failed", 0, f"{player_name}: {last_error!r}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=8, help="Concurrent requests (default: 8)")
    parser.add_argument("--force", action="store_true", help="Refresh existing player files")
    parser.add_argument("--limit", type=int, help="Only process the first N players (for testing)")
    args = parser.parse_args()

    if not INPUT_PATH.exists():
        raise FileNotFoundError(f"Missing {INPUT_PATH}. Run scripts/build_free_data.py first.")

    rows = pd.read_csv(INPUT_PATH, usecols=["provider_player_id", "player_name", "season"])
    rows = rows.dropna(subset=["provider_player_id", "player_name", "season"])
    rows["provider_player_id"] = rows["provider_player_id"].astype(int)
    season_sets = rows.groupby("provider_player_id")["season"].apply(lambda values: set(values.astype(str)))
    names = rows.drop_duplicates("provider_player_id").set_index("provider_player_id")["player_name"].to_dict()
    player_ids = sorted(season_sets.index.tolist())
    if args.limit:
        player_ids = player_ids[: args.limit]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    counts = {"downloaded": 0, "cached": 0, "failed": 0, "shots": 0}
    failures: list[str] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(
                fetch_player,
                player_id,
                str(names[player_id]),
                season_sets[player_id],
                args.force,
            ): player_id
            for player_id in player_ids
        }
        for index, future in enumerate(concurrent.futures.as_completed(futures), start=1):
            status, shot_count, detail = future.result()
            counts[status] += 1
            counts["shots"] += shot_count
            if status == "failed":
                failures.append(f"{futures[future]} — {detail}")
            if index % 50 == 0 or index == len(futures):
                print(
                    f"{index}/{len(futures)} players · {counts['downloaded']} downloaded · "
                    f"{counts['cached']} cached · {counts['failed']} failed · {counts['shots']} shots"
                )

    manifest = {
        "source": "Understat",
        "players": len(player_ids),
        "files": counts["downloaded"] + counts["cached"],
        "shots": counts["shots"],
        "failed": counts["failed"],
        "failures": failures,
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    if failures:
        print("Failed player IDs:")
        print("\n".join(failures))


if __name__ == "__main__":
    main()
