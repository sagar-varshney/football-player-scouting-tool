"""Completed-season validation for the free Understat profile model."""

from __future__ import annotations

import json
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler


FEATURES = [
    "goals_p90",
    "xg_p90",
    "assists_p90",
    "xa_p90",
    "shots_p90",
    "key_passes_p90",
    "xg_chain_p90",
    "xg_buildup_p90",
]
PRIOR_CANDIDATES = [0, 300, 450, 600, 900, 1200, 1500, 1800]
POSITION_WEIGHTS = {
    "Forward": [1.5, 1.4, 0.7, 0.6, 1.2, 0.5, 0.8, 0.4],
    "Winger": [1.0, 1.0, 1.1, 1.3, 1.1, 1.4, 1.0, 0.7],
    "Midfielder": [0.5, 0.6, 0.9, 1.3, 0.6, 1.5, 1.3, 1.4],
    "Defender": [0.3, 0.4, 0.5, 0.8, 0.3, 1.0, 1.3, 1.6],
}
BRIEF_MULTIPLIERS = [
    [1.0, 1.0, 1.0],
    [1.65, 0.65, 0.80],
    [0.70, 1.65, 0.95],
    [0.65, 1.00, 1.70],
]


def _category_index(feature: str) -> int:
    if feature in {"goals_p90", "xg_p90", "shots_p90"}:
        return 0
    if feature in {"assists_p90", "xa_p90", "key_passes_p90"}:
        return 1
    return 2


def _reliability_backtest(df: pd.DataFrame, current_prior: int) -> dict:
    seasons = sorted(df["season"].astype(str).unique())
    completed_transitions = list(zip(seasons[:-2], seasons[1:-1]))
    errors = {prior: [] for prior in PRIOR_CANDIDATES}
    feature_errors = {feature: {prior: [] for prior in PRIOR_CANDIDATES} for feature in FEATURES}
    pair_count = 0

    for previous_season, next_season in completed_transitions:
        previous = df[df["season"].astype(str) == previous_season]
        following = df[df["season"].astype(str) == next_season]
        pairs = previous.merge(
            following,
            on=["provider_player_id", "position"],
            suffixes=("_previous", "_next"),
        )
        pair_count += len(pairs)
        for _, player in pairs.iterrows():
            position = player["position"]
            cohort_previous = previous[previous["position"] == position]
            cohort_next = following[following["position"] == position]
            minutes = float(player["minutes_previous"])
            for feature in FEATURES:
                cohort_mean = float(cohort_previous[feature].mean())
                scale = float(cohort_next[feature].std()) or 1.0
                observed_next = float(player[f"{feature}_next"])
                for prior in PRIOR_CANDIDATES:
                    prediction = (
                        (float(player[f"{feature}_previous"]) * minutes) + (cohort_mean * prior)
                    ) / (minutes + prior)
                    error = abs(prediction - observed_next) / scale
                    errors[prior].append(error)
                    feature_errors[feature][prior].append(error)

    scores = {prior: float(np.mean(values)) for prior, values in errors.items()}
    best_prior = min(scores, key=scores.get)
    raw_error = scores[0]
    current_error = scores[current_prior]
    return {
        "completed_seasons": seasons[:-1],
        "transition_pairs": pair_count,
        "candidate_priors": [
            {"minutes": prior, "normalized_mae": round(scores[prior], 4)}
            for prior in PRIOR_CANDIDATES
        ],
        "raw_normalized_mae": round(raw_error, 4),
        "current_prior_minutes": current_prior,
        "current_prior_normalized_mae": round(current_error, 4),
        "current_prior_error_reduction_pct": round((1 - current_error / raw_error) * 100, 1),
        "best_tested_prior_minutes": best_prior,
        "best_tested_normalized_mae": round(scores[best_prior], 4),
        "current_to_best_error_gap_pct": round((current_error / scores[best_prior] - 1) * 100, 2),
        "decision": (
            f"Retain the {current_prior}-minute prior: it is within 1% of the best tested error "
            "while preserving more responsiveness to established player samples."
            if current_error / scores[best_prior] <= 1.01
            else f"Review the {current_prior}-minute prior before the next model release."
        ),
        "feature_error_reduction_pct": {
            feature: round((1 - np.mean(values[current_prior]) / np.mean(values[0])) * 100, 1)
            for feature, values in feature_errors.items()
        },
    }


def _brief_stability(df: pd.DataFrame, prior_minutes: int) -> dict:
    retentions: list[float] = []
    pairwise_overlaps: list[float] = []
    for (_, position), cohort in df.groupby(["season", "position"]):
        if len(cohort) < 11:
            continue
        adjusted = pd.DataFrame(index=cohort.index)
        for feature in FEATURES:
            mean = float(cohort[feature].mean())
            adjusted[feature] = (
                (cohort[feature] * cohort["minutes"]) + (mean * prior_minutes)
            ) / (cohort["minutes"] + prior_minutes)
            adjusted[feature] = adjusted[feature].rank(pct=True).mul(100)

        base_weights = np.array(POSITION_WEIGHTS[position], dtype=float)
        for index in cohort.index:
            top_sets = []
            for brief in BRIEF_MULTIPLIERS:
                multipliers = np.array([brief[_category_index(feature)] for feature in FEATURES])
                weights = base_weights * multipliers
                scores = 100 - (adjusted[FEATURES].sub(adjusted.loc[index, FEATURES]).abs() * weights).sum(axis=1) / weights.sum()
                top_sets.append(set(scores.drop(index).nlargest(10).index))
            retentions.append(len(set.intersection(*top_sets)) / 10)
            pairwise_overlaps.extend(
                len(left & right) / len(left | right)
                for left, right in combinations(top_sets, 2)
            )
    return {
        "evaluated_profiles": len(retentions),
        "all_brief_top10_retention_pct": round(float(np.mean(retentions)) * 100, 1),
        "median_all_brief_top10_retention_pct": round(float(np.median(retentions)) * 100, 1),
        "mean_pairwise_top10_jaccard_pct": round(float(np.mean(pairwise_overlaps)) * 100, 1),
        "interpretation": "Brief changes materially affect some recommendations, so the product exposes sensitivity for every match.",
    }


def build_validation(df: pd.DataFrame, current_prior: int = 900, cluster_count: int = 5) -> dict:
    clean = df.copy()
    clean[FEATURES] = clean[FEATURES].fillna(0)
    scaled = StandardScaler().fit_transform(clean[FEATURES])
    labels = KMeans(n_clusters=cluster_count, random_state=42, n_init=10).fit_predict(scaled)
    silhouette = float(silhouette_score(scaled, labels))
    clean["validation_cluster"] = labels
    seasons = sorted(clean["season"].astype(str).unique())
    distributions = {
        season: clean[clean["season"].astype(str) == season]["validation_cluster"]
        .value_counts(normalize=True)
        .reindex(range(cluster_count), fill_value=0)
        for season in seasons
    }
    drifts = []
    for previous, current in zip(seasons[:-1], seasons[1:]):
        total_variation = float(0.5 * np.abs(distributions[previous] - distributions[current]).sum())
        drifts.append({"from": previous, "to": current, "total_variation": round(total_variation, 4)})
    latest_drift = drifts[-1]

    return {
        "schema_version": 1,
        "method": "Completed-season year-ahead rate prediction plus within-cohort ranking sensitivity.",
        "reliability": _reliability_backtest(clean, current_prior),
        "brief_stability": _brief_stability(clean, current_prior),
        "clusters": {
            "cluster_count": cluster_count,
            "silhouette_score": round(silhouette, 4),
            "separation_label": "Moderate separation" if silhouette >= 0.25 else "Weak separation",
            "season_distribution_drift": drifts,
            "latest_distribution_drift_pct": round(latest_drift["total_variation"] * 100, 1),
            "latest_distribution_drift_period": f"{latest_drift['from']} to {latest_drift['to']}",
            "interpretation": "Clusters are descriptive style groups, not scouting grades or natural-position ground truth.",
        },
        "coverage": {
            "profiles": len(clean),
            "feature_completeness_pct": round(float(clean[FEATURES].notna().mean().mean()) * 100, 1),
            "minimum_minutes": int(clean["minutes"].min()),
        },
    }


def write_validation_reports(validation: dict, json_path: Path, markdown_path: Path) -> None:
    json_path.write_text(json.dumps(validation, indent=2, ensure_ascii=False), encoding="utf-8")
    reliability = validation["reliability"]
    stability = validation["brief_stability"]
    clusters = validation["clusters"]
    markdown = f"""# Model Validation Report

This report is generated from the committed free Understat player-season dataset. It evaluates model behaviour; it does not claim that statistical similarity predicts transfer success.

## Reliability prior

- Completed-season player transitions: **{reliability['transition_pairs']:,}**
- Current prior: **{reliability['current_prior_minutes']:,} minutes**
- Error reduction versus raw per-90 rates: **{reliability['current_prior_error_reduction_pct']:.1f}%**
- Best tested prior: **{reliability['best_tested_prior_minutes']:,} minutes**
- Current-to-best error gap: **{reliability['current_to_best_error_gap_pct']:.2f}%**
- Decision: {reliability['decision']}

## Recruitment-brief sensitivity

- Profiles evaluated: **{stability['evaluated_profiles']:,}**
- Mean share of top-10 matches retained across all four briefs: **{stability['all_brief_top10_retention_pct']:.1f}%**
- Mean pairwise top-10 Jaccard overlap: **{stability['mean_pairwise_top10_jaccard_pct']:.1f}%**

{stability['interpretation']}

## Cluster diagnostics

- KMeans clusters: **{clusters['cluster_count']}**
- Silhouette score: **{clusters['silhouette_score']:.3f}** ({clusters['separation_label'].lower()})
- Latest cluster-distribution drift: **{clusters['latest_distribution_drift_pct']:.1f}%** ({clusters['latest_distribution_drift_period']})

{clusters['interpretation']}
"""
    markdown_path.write_text(markdown, encoding="utf-8")
