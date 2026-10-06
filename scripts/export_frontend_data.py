"""Export the Python scouting model outputs for the Next.js frontend."""

from __future__ import annotations

import json
import os
import pathlib
import sys
import warnings

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 4))
warnings.filterwarnings("ignore", message="Could not find the number of physical cores.*")

from src.preprocessing import FEATURE_COLS, compute_percentiles, preprocess
from src.scouting_engine import assign_role_archetypes, cluster_players


DATA_PATH = ROOT / "data" / "players.csv"
OUTPUT_PATH = ROOT / "frontend" / "public" / "scouting-data.json"


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


def main() -> None:
    players, scaled, _ = preprocess(DATA_PATH)
    clustered, _, cluster_map = cluster_players(scaled, k=5)
    percentiles = compute_percentiles(players, feature_cols=FEATURE_COLS)

    output_rows = players.copy()
    output_rows["cluster"] = clustered["cluster"].values
    output_rows["archetype"] = assign_role_archetypes(players, feature_cols=FEATURE_COLS).values

    scaled_rows = scaled[["player_id", "player_name", "position", *FEATURE_COLS]].copy()
    scaled_rows = scaled_rows.rename(columns={column: f"scaled_{column}" for column in FEATURE_COLS})
    percentile_rows = percentiles.rename(columns={column: f"pct_{column}" for column in FEATURE_COLS})

    merged = output_rows.join(scaled_rows[[f"scaled_{column}" for column in FEATURE_COLS]])
    merged = merged.join(percentile_rows)

    cluster_profiles = (
        output_rows.groupby("archetype")[FEATURE_COLS]
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
            "seasons": sorted(merged["season"].dropna().unique().tolist()) if "season" in merged.columns else [],
            "features": FEATURE_COLS,
            "cluster_map": {str(key): value for key, value in cluster_map.items()},
            "data_note": (
                "Premier League player names and club-season rows are curated from football-data.org-style squad data; "
                "advanced per-90 scouting metrics are generated until a richer event-data source is connected."
            ),
        },
        "players": [rounded_record(row) for row in merged.to_dict(orient="records")],
        "cluster_profiles": [rounded_record(row) for row in cluster_profiles],
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Exported {len(merged)} players to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
