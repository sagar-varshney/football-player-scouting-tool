"""Export normalized free data into the Next.js scouting payload."""

from __future__ import annotations

import json
import hashlib
import os
import pathlib
import sys
import warnings
from datetime import datetime, timezone

os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 4))
warnings.filterwarnings("ignore", message="Could not find the number of physical cores.*")

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler


ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from src.display_names import preferred_player_name

INPUT_PATH = ROOT / "data" / "free_data" / "understat_epl_player_seasons.csv"
OUTPUT_PATH = ROOT / "frontend" / "public" / "scouting-data.json"

FREE_FEATURE_COLS = [
    "goals_p90",
    "xg_p90",
    "assists_p90",
    "xa_p90",
    "shots_p90",
    "key_passes_p90",
    "xg_chain_p90",
    "xg_buildup_p90",
]
MODEL_VERSION = "understat-profile-v2.1"
MINIMUM_MINUTES = 450
RELIABILITY_PRIOR_MINUTES = 900


def rounded_record(record: dict) -> dict:
    clean = {}
    for key, value in record.items():
        if hasattr(value, "item"):
            value = value.item()
        if isinstance(value, float):
            clean[key] = round(value, 4)
        else:
            clean[key] = value
    return clean


def assign_understat_archetypes(df: pd.DataFrame) -> pd.Series:
    pct = (
        df.groupby("position", group_keys=False)[FREE_FEATURE_COLS]
        .rank(pct=True)
        .mul(100)
        .fillna(50)
    )
    labels: list[str] = []
    for index, row in df.iterrows():
        p = pct.loc[index]
        position = row.get("position")
        finishing = np.mean([p["goals_p90"], p["xg_p90"], p["shots_p90"]])
        creation = np.mean([p["assists_p90"], p["xa_p90"], p["key_passes_p90"]])
        involvement = p["xg_chain_p90"]
        buildup = p["xg_buildup_p90"]

        if position == "Forward":
            if finishing >= 72 and creation < 58:
                label = "Penalty Box Finisher"
            elif creation >= 66:
                label = "Link Forward"
            elif involvement >= 68:
                label = "High-Involvement Forward"
            else:
                label = "Balanced Forward"
        elif position == "Winger":
            if creation >= 72 and finishing >= 55:
                label = "Goal-Creating Winger"
            elif finishing >= 70:
                label = "Inside Forward"
            elif creation >= 66:
                label = "Chance-Creating Winger"
            else:
                label = "Wide Outlet"
        elif position == "Midfielder":
            if creation >= 72:
                label = "Advanced Playmaker"
            elif buildup >= 72:
                label = "Buildup Connector"
            elif involvement >= 70:
                label = "Possession Hub"
            else:
                label = "Support Midfielder"
        elif position == "Defender":
            if buildup >= 72:
                label = "Buildup Defender"
            elif creation >= 64:
                label = "Attacking Fullback"
            else:
                label = "Low-Usage Defender"
        else:
            label = "Unclassified Role"
        labels.append(label)
    return pd.Series(labels, index=df.index, name="archetype")


def main() -> None:
    if not INPUT_PATH.exists():
        raise FileNotFoundError(f"Missing {INPUT_PATH}. Run `python scripts/build_free_data.py` first.")

    source_bytes = INPUT_PATH.read_bytes()
    dataset_version = f"epl-{hashlib.sha256(source_bytes).hexdigest()[:10]}"
    generated_at = datetime.fromtimestamp(INPUT_PATH.stat().st_mtime, tz=timezone.utc).isoformat(timespec="seconds")
    players = pd.read_csv(INPUT_PATH)
    players = players[players["position"] != "Goalkeeper"].copy()
    players = players.dropna(subset=["player_name", "club", "season", "position"])
    players["player_name"] = players.apply(
        lambda row: preferred_player_name(row["player_name"], row.get("provider_player_id")),
        axis=1,
    )
    players[FREE_FEATURE_COLS] = players[FREE_FEATURE_COLS].fillna(0)
    players.insert(0, "player_id", range(1, len(players) + 1))
    players["age"] = 0

    scaler = StandardScaler()
    scaled_values = scaler.fit_transform(players[FREE_FEATURE_COLS])
    scaled = pd.DataFrame(scaled_values, columns=[f"scaled_{column}" for column in FREE_FEATURE_COLS])
    percentiles = players[FREE_FEATURE_COLS].rank(pct=True).mul(100)
    percentiles = percentiles.rename(columns={column: f"pct_{column}" for column in FREE_FEATURE_COLS})

    kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
    players["cluster"] = kmeans.fit_predict(scaled_values)
    players["archetype"] = assign_understat_archetypes(players)

    merged = players.join(scaled).join(percentiles)
    cluster_profiles = (
        players.groupby("archetype")[FREE_FEATURE_COLS]
        .mean()
        .round(3)
        .reset_index()
        .to_dict(orient="records")
    )

    payload = {
        "metadata": {
            "row_count": len(merged),
            "positions": sorted(merged["position"].dropna().unique().tolist()),
            "clubs": sorted(merged["club"].dropna().unique().tolist()),
            "seasons": sorted(merged["season"].dropna().unique().tolist()),
            "features": FREE_FEATURE_COLS,
            "source_provider": "understat",
            "dataset_version": dataset_version,
            "model_version": MODEL_VERSION,
            "generated_at": generated_at,
            "minimum_minutes": MINIMUM_MINUTES,
            "reliability_prior_minutes": RELIABILITY_PRIOR_MINUTES,
            "player_name_policy": "Curated football display names; raw provider names remain in the normalized source data.",
            "data_note": (
                "Real free EPL player-season data from Understat, filtered to players with 450+ minutes. "
                "Metrics cover attacking and creative style: xG, xA, shots, key passes, move involvement, and buildup play. "
                "Defensive actions, carries, pressures, and progressive passes are not available in this free source."
            ),
        },
        "players": [rounded_record(row) for row in merged.to_dict(orient="records")],
        "cluster_profiles": [rounded_record(row) for row in cluster_profiles],
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Exported {len(merged)} Understat player-season rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
