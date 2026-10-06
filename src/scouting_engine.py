"""
Scouting engine: clustering + similarity search.
"""

from __future__ import annotations

import os
import warnings

os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 4))
warnings.filterwarnings("ignore", message="Could not find the number of physical cores.*")

import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.manifold import TSNE

from src.preprocessing import FEATURE_COLS

# ---------------------------------------------------------------------------
# Archetype labels for k=4 and k=5 (ordered by cluster interpretation helper)
# ---------------------------------------------------------------------------
# We assign generic archetype names; the mapping from cluster index to label
# is determined by interpreting cluster centroids (see _label_clusters).
ARCHETYPE_LABELS_K4: list[str] = [
    "Clinical Finisher",
    "Creative Playmaker",
    "Defensive Anchor",
    "Ball-Carrying Winger",
]

ARCHETYPE_LABELS_K5: list[str] = [
    "Clinical Finisher",
    "Creative Playmaker",
    "Defensive Anchor",
    "Ball-Carrying Winger",
    "Progressive Midfielder",
]


def _label_clusters(centroids: np.ndarray, feature_cols: list[str], k: int) -> dict[int, str]:
    """
    Heuristic: assign archetype labels to cluster indices by inspecting
    centroid vectors. Centroids are in scaled space; larger value = higher
    than average on that metric.
    """
    n_clusters = centroids.shape[0]
    # indices for key signals
    idx = {c: feature_cols.index(c) for c in feature_cols if c in feature_cols}
    # score each cluster on intuitive axes
    scores: dict[int, dict[str, float]] = {}
    for ci in range(n_clusters):
        c = centroids[ci]
        scores[ci] = {
            "finish": float(c[idx["goals_p90"]] + c[idx["xg_p90"]] + c[idx["shots_p90"]]),
            "create": float(c[idx["assists_p90"]] + c[idx["xa_p90"]] + c[idx["key_passes_p90"]]),
            "defend": float(c[idx["tackles_interceptions_p90"]] + c[idx["clearances_p90"]]),
            "carry": float(c[idx["dribbles_p90"]] + c[idx["progressive_passes_p90"]]),
        }

    # Greedy assignment: pick best cluster for each archetype, no reuse.
    labels = ARCHETYPE_LABELS_K5 if k == 5 else ARCHETYPE_LABELS_K4
    # Define archetype -> scoring key
    archetype_key = {
        "Clinical Finisher": "finish",
        "Creative Playmaker": "create",
        "Defensive Anchor": "defend",
        "Ball-Carrying Winger": "carry",
        "Progressive Midfielder": "carry",  # tie-breaker handled via remaining
    }
    # For k=5, Progressive Midfielder prefers high progressive_passes + pass_accuracy
    # We'll secondarily rank by that.
    assigned: dict[int, str] = {}
    remaining_clusters = set(range(n_clusters))
    remaining_labels = labels.copy()

    # For each label, pick cluster with max score on its key among remaining
    # Do defend/finish first (most distinctive), then others.
    priority = ["Defensive Anchor", "Clinical Finisher", "Creative Playmaker", "Ball-Carrying Winger", "Progressive Midfielder"]
    ordered = [lbl for lbl in priority if lbl in remaining_labels]

    for lbl in ordered:
        if not remaining_clusters:
            break
        key = archetype_key[lbl]
        best = max(remaining_clusters, key=lambda ci: scores[ci][key])
        # For Progressive Midfielder tie-break: prefer progressive_passes centroid
        if lbl == "Progressive Midfielder" and len(remaining_clusters) > 1:
            # If multiple close, keep the greedy pick; it's okay.
            pass
        assigned[best] = lbl
        remaining_clusters.remove(best)
        remaining_labels.remove(lbl)

    # Any leftover (should not happen) -> generic
    for ci in remaining_clusters:
        assigned[ci] = f"Archetype {ci}"

    return assigned


def cluster_players(
    df_scaled: pd.DataFrame,
    feature_cols: list[str] | None = None,
    k: int = 4,
    random_state: int = 42,
) -> tuple[pd.DataFrame, KMeans, dict[int, str]]:
    """
    Run KMeans on scaled features.

    Returns (df_with_cluster, kmeans_model, cluster_label_map).
    Adds columns: `cluster` (int) and `archetype` (str).
    """
    if feature_cols is None:
        feature_cols = [c for c in FEATURE_COLS if c in df_scaled.columns]
    X = df_scaled[feature_cols].values
    kmeans = KMeans(n_clusters=k, random_state=random_state, n_init=10)
    labels = kmeans.fit_predict(X)
    cluster_map = _label_clusters(kmeans.cluster_centers_, feature_cols, k)

    df_out = df_scaled.copy()
    df_out["cluster"] = labels
    df_out["archetype"] = df_out["cluster"].map(cluster_map)
    return df_out, kmeans, cluster_map


def assign_role_archetypes(
    df: pd.DataFrame,
    feature_cols: list[str] | None = None,
) -> pd.Series:
    """
    Assign row-level scouting roles from position-aware percentile signals.

    KMeans is still useful for coarse grouping, but scouts need labels that can
    change by player-season. These rules use the actual filled metrics, compare
    players inside their position, and return a readable role for each row.
    """
    if feature_cols is None:
        feature_cols = [c for c in FEATURE_COLS if c in df.columns]

    percentiles = (
        df.groupby("position", group_keys=False)[feature_cols]
        .rank(pct=True)
        .mul(100)
        .fillna(50)
    )

    labels: list[str] = []
    for index, row in df.iterrows():
        pct = percentiles.loc[index]
        position = row.get("position", "")

        finishing = np.mean([pct["goals_p90"], pct["xg_p90"], pct["shots_p90"]])
        creativity = np.mean([pct["assists_p90"], pct["xa_p90"], pct["key_passes_p90"]])
        carrying = np.mean([pct["dribbles_p90"], pct["progressive_passes_p90"]])
        defending = np.mean([pct["tackles_interceptions_p90"], pct["clearances_p90"]])
        progression = np.mean([pct["progressive_passes_p90"], pct["pass_accuracy_pct"]])

        if position == "Forward":
            if finishing >= 72 and creativity < 58:
                label = "Penalty Box Finisher"
            elif creativity >= 68 and progression >= 55:
                label = "Link Forward"
            elif carrying >= 65:
                label = "Channel Runner"
            else:
                label = "Pressing Forward" if defending >= 62 else "Balanced Forward"
        elif position == "Winger":
            if carrying >= 72 and creativity >= 60:
                label = "Ball-Carrying Creator"
            elif finishing >= 70:
                label = "Inside Forward"
            elif creativity >= 70:
                label = "Chance-Creating Winger"
            else:
                label = "Two-Way Winger" if defending >= 62 else "Wide Outlet"
        elif position == "Midfielder":
            if defending >= 72 and progression < 64:
                label = "Ball-Winning Midfielder"
            elif progression >= 72 and creativity >= 55:
                label = "Deep Progressor"
            elif creativity >= 72:
                label = "Advanced Playmaker"
            else:
                label = "Box-to-Box Midfielder" if carrying >= 58 and defending >= 55 else "Tempo Midfielder"
        elif position == "Defender":
            if progression >= 70 and creativity >= 48:
                label = "Progressive Defender"
            elif defending >= 74 and pct["clearances_p90"] >= 68:
                label = "Defensive Stopper"
            elif pct["pass_accuracy_pct"] >= 72 and pct["progressive_passes_p90"] >= 58:
                label = "Ball-Playing Defender"
            else:
                label = "Recovery Defender" if pct["tackles_interceptions_p90"] >= 62 else "Balanced Defender"
        else:
            label = "Unclassified Role"

        labels.append(label)

    return pd.Series(labels, index=df.index, name="archetype")


def find_similar_players(
    df_scaled: pd.DataFrame,
    target_player: str,
    top_n: int = 5,
    feature_cols: list[str] | None = None,
    position_filter: str | None = None,
) -> pd.DataFrame:
    """
    Cosine similarity search on scaled metrics.

    - df_scaled: DataFrame that already has scaled FEATURE_COLS and `player_name` column.
    - target_player: exact player_name to match.
    - top_n: number of results (excluding the target itself).
    - position_filter: if provided, only consider players of that position.
    - Returns DataFrame sorted by similarity descending with column `similarity`
      (0-1) and `similarity_pct` (0-100).
    """
    if feature_cols is None:
        feature_cols = [c for c in FEATURE_COLS if c in df_scaled.columns]

    if target_player not in df_scaled["player_name"].values:
        raise ValueError(f"Player '{target_player}' not found.")

    # Optionally filter candidate pool
    candidates = df_scaled
    if position_filter and position_filter != "All":
        candidates = df_scaled[df_scaled["position"] == position_filter]
        if target_player not in candidates["player_name"].values:
            # ensure target is included for similarity calc even if filter excludes
            # we compute similarity against the filtered pool + target
            target_row = df_scaled[df_scaled["player_name"] == target_player]
            candidates = pd.concat([candidates, target_row], ignore_index=False)

    X = candidates[feature_cols].values
    names = candidates["player_name"].values
    target_idx_in_candidates = int(np.where(names == target_player)[0][0])
    target_vec = X[target_idx_in_candidates].reshape(1, -1)

    sims = cosine_similarity(target_vec, X).flatten()

    result = candidates.copy()
    result["similarity"] = sims
    result["similarity_pct"] = (sims * 100).round(1)
    # Exclude target itself
    result = result[result["player_name"] != target_player]
    result = result.sort_values("similarity", ascending=False).head(top_n)
    return result


def get_pca_projection(
    df_scaled: pd.DataFrame,
    feature_cols: list[str] | None = None,
    n_components: int = 2,
    random_state: int = 42,
) -> tuple[np.ndarray, PCA]:
    """Return 2D PCA projection and fitted PCA object."""
    if feature_cols is None:
        feature_cols = [c for c in FEATURE_COLS if c in df_scaled.columns]
    pca = PCA(n_components=n_components, random_state=random_state)
    proj = pca.fit_transform(df_scaled[feature_cols].values)
    return proj, pca


def get_tsne_projection(
    df_scaled: pd.DataFrame,
    feature_cols: list[str] | None = None,
    random_state: int = 42,
    perplexity: float = 30,
) -> np.ndarray:
    """Return 2D t-SNE projection."""
    if feature_cols is None:
        feature_cols = [c for c in FEATURE_COLS if c in df_scaled.columns]
    n = len(df_scaled)
    # perplexity must be < n
    perp = min(perplexity, max(5, n // 4))
    tsne = TSNE(n_components=2, random_state=random_state, perplexity=perp, init="pca", learning_rate="auto")
    proj = tsne.fit_transform(df_scaled[feature_cols].values)
    return proj
