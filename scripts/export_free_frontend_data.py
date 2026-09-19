"""Export normalized free data into the Next.js scouting payload."""

from __future__ import annotations

import json
import hashlib
import os
import pathlib
import re
import sys
import unicodedata
import warnings
from datetime import date, datetime, timezone
from html import unescape

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
FPL_INPUT_PATH = ROOT / "data" / "free_data" / "fpl_current_players.csv"
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
MODEL_VERSION = "understat-profile-v2.2"
MINIMUM_MINUTES = 450
RELIABILITY_PRIOR_MINUTES = 900


def rounded_record(record: dict) -> dict:
    clean = {}
    for key, value in record.items():
        if value is None or (not isinstance(value, (list, dict)) and pd.isna(value)):
            clean[key] = None
            continue
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
        scoring = np.mean([p["goals_p90"], p["xg_p90"]])
        shot_volume = p["shots_p90"]
        creation = np.mean([p["assists_p90"], p["xa_p90"], p["key_passes_p90"]])
        involvement = p["xg_chain_p90"]
        buildup = p["xg_buildup_p90"]

        if position == "Forward":
            if finishing >= 72 and creation >= 66:
                label = "Complete Forward"
            elif scoring >= 74 and creation < 58:
                label = "Penalty Box Finisher"
            elif creation >= 68 and involvement >= 58:
                label = "Link Forward"
            elif buildup >= 68 or involvement >= 72:
                label = "Connecting Forward"
            elif shot_volume >= 68:
                label = "Shot-Focused Forward"
            else:
                label = "Balanced Forward"
        elif position == "Winger":
            if creation >= 70 and finishing >= 68:
                label = "Goal-Creating Winger"
            elif scoring >= 72 and shot_volume >= 66:
                label = "Inside Forward"
            elif creation >= 74 and buildup >= 62:
                label = "Wide Playmaker"
            elif creation >= 68:
                label = "Chance-Creating Winger"
            elif involvement >= 72:
                label = "Combination Winger"
            else:
                label = "Wide Outlet"
        elif position == "Midfielder":
            if finishing >= 68 and creation >= 64:
                label = "Goal-Creating Midfielder"
            elif creation >= 76:
                label = "Advanced Playmaker"
            elif buildup >= 75 and involvement >= 68:
                label = "Possession Controller"
            elif buildup >= 68:
                label = "Buildup Connector"
            elif involvement >= 72:
                label = "Possession Hub"
            else:
                label = "Support Midfielder"
        elif position == "Defender":
            if creation >= 68 and buildup >= 58:
                label = "Attacking Defender"
            elif buildup >= 74 and involvement >= 62:
                label = "Possession Defender"
            elif buildup >= 66 or involvement >= 68:
                label = "Buildup Defender"
            else:
                label = "Low-Usage Defender"
        else:
            label = "Unclassified Role"
        labels.append(label)
    return pd.Series(labels, index=df.index, name="archetype")


def identity_key(value: object) -> str:
    text = unicodedata.normalize("NFKD", unescape(str(value))).casefold()
    return re.sub(r"[^a-z0-9]", "", "".join(char for char in text if not unicodedata.combining(char)))


def identity_tokens(value: object) -> set[str]:
    text = unicodedata.normalize("NFKD", unescape(str(value))).casefold()
    cleaned = "".join(char if char.isalnum() else " " for char in text if not unicodedata.combining(char))
    return {token for token in cleaned.split() if len(token) > 1}


CLUB_ALIASES = {
    "manutd": "manchesterunited",
    "spurs": "tottenham",
    "nottmforest": "nottinghamforest",
    "wolves": "wolverhamptonwanderers",
    "brightonandhovealbion": "brighton",
}


def club_keys(value: object) -> set[str]:
    return {CLUB_ALIASES.get(identity_key(item), identity_key(item)) for item in str(value).split(",")}


def age_on(birth_date: object, as_of: date) -> int | None:
    try:
        born = date.fromisoformat(str(birth_date))
    except (TypeError, ValueError):
        return None
    return as_of.year - born.year - ((as_of.month, as_of.day) < (born.month, born.day))


def enrich_current_fpl_context(players: pd.DataFrame) -> tuple[pd.DataFrame, int, str | None]:
    context_columns = ["current_fpl_player_id", "current_age", "current_status", "current_status_code", "current_news", "current_club", "current_context_as_of", "current_context_match"]
    for column in context_columns:
        players[column] = None
    if not FPL_INPUT_PATH.exists():
        return players, 0, None

    fpl = pd.read_csv(FPL_INPUT_PATH).fillna("")
    as_of = datetime.fromtimestamp(FPL_INPUT_PATH.stat().st_mtime, tz=timezone.utc).date()
    status_labels = {"a": "Available", "d": "Doubtful", "i": "Injured", "s": "Suspended", "u": "Unavailable", "n": "Unavailable"}
    name_index: dict[str, list[int]] = {}
    for index, row in fpl.iterrows():
        for field in ("player_name", "web_name"):
            key = identity_key(row[field])
            if key:
                name_index.setdefault(key, []).append(index)

    latest_season = str(players["season"].max())
    latest = players[players["season"].astype(str) == latest_season]
    assignments: dict[int, tuple[pd.Series, str]] = {}
    used_fpl_ids: set[int] = set()
    for _, player in latest.iterrows():
        name = identity_key(player["player_name"])
        exact_indices = set(name_index.get(name, []))
        candidates = fpl.loc[sorted(exact_indices)] if exact_indices else fpl.iloc[0:0]
        method = "exact name"
        if len(candidates) != 1:
            player_clubs = club_keys(player["club"])
            same_club = fpl[fpl["club"].map(lambda club: bool(club_keys(club) & player_clubs))]
            partial_indices = []
            for index, candidate in same_club.iterrows():
                web_name = identity_key(candidate["web_name"])
                player_tokens = identity_tokens(player["player_name"])
                candidate_tokens = identity_tokens(candidate["player_name"])
                shared_tokens = player_tokens & candidate_tokens
                token_coverage = len(shared_tokens) / max(1, min(len(player_tokens), len(candidate_tokens)))
                if (len(web_name) >= 4 and (web_name in name or name in web_name)) or (len(shared_tokens) >= 2 and token_coverage >= 0.8):
                    partial_indices.append(index)
            candidates = fpl.loc[partial_indices]
            method = "club + unique football name"
        if len(candidates) != 1:
            continue
        candidate = candidates.iloc[0]
        fpl_id = int(candidate["fpl_player_id"])
        if fpl_id in used_fpl_ids:
            continue
        used_fpl_ids.add(fpl_id)
        assignments[int(player["provider_player_id"])] = (candidate, method)

    for index, player in players.iterrows():
        assignment = assignments.get(int(player["provider_player_id"]))
        if not assignment:
            continue
        context, method = assignment
        status_code = str(context.get("status") or "")
        players.at[index, "current_fpl_player_id"] = int(context["fpl_player_id"])
        players.at[index, "current_age"] = age_on(context.get("birth_date"), as_of)
        players.at[index, "current_status"] = status_labels.get(status_code, "Status unknown")
        players.at[index, "current_status_code"] = status_code
        players.at[index, "current_news"] = str(context.get("news") or "")
        players.at[index, "current_club"] = str(context.get("club") or "")
        players.at[index, "current_context_as_of"] = as_of.isoformat()
        players.at[index, "current_context_match"] = method
    return players, len(assignments), as_of.isoformat()


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
    players, fpl_context_players, fpl_context_as_of = enrich_current_fpl_context(players)
    players["age"] = players["current_age"]

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
            "context_provider": "Fantasy Premier League",
            "dataset_version": dataset_version,
            "context_version": f"fpl-{hashlib.sha256(FPL_INPUT_PATH.read_bytes()).hexdigest()[:10]}" if FPL_INPUT_PATH.exists() else None,
            "model_version": MODEL_VERSION,
            "generated_at": generated_at,
            "current_context_as_of": fpl_context_as_of,
            "current_context_players": fpl_context_players,
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
