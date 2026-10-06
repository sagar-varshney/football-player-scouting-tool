"""
Preprocessing utilities: load data, handle missing values, scale features.
"""

from __future__ import annotations

import pathlib

import pandas as pd
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Canonical feature columns (must match generator.py METRIC_COLS)
# ---------------------------------------------------------------------------
FEATURE_COLS: list[str] = [
    "goals_p90",
    "xg_p90",
    "assists_p90",
    "xa_p90",
    "shots_p90",
    "key_passes_p90",
    "pass_accuracy_pct",
    "dribbles_p90",
    "tackles_interceptions_p90",
    "clearances_p90",
    "progressive_passes_p90",
]

ID_COLS: list[str] = ["player_id", "player_name", "position", "age", "club"]


def load_data(csv_path: str | pathlib.Path = "data/players.csv") -> pd.DataFrame:
    """Load players CSV. Raises FileNotFoundError with helpful message."""
    path = pathlib.Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Data file not found: {path.resolve()}. "
            "Run `python data/generator.py` to generate it."
        )
    df = pd.read_csv(path)
    return df


def handle_missing(df: pd.DataFrame, strategy: str = "median") -> pd.DataFrame:
    """
    Fill NaNs in FEATURE_COLS.

    strategy: "median" (default) or "mean". Uses per-position median/mean if
    position column exists, otherwise global.
    """
    df = df.copy()
    for col in FEATURE_COLS:
        if col not in df.columns:
            continue
        if df[col].isna().any():
            if strategy == "mean":
                if "position" in df.columns:
                    df[col] = df.groupby("position")[col].transform(
                        lambda s: s.fillna(s.mean())
                    )
                    df[col] = df[col].fillna(df[col].mean())
                else:
                    df[col] = df[col].fillna(df[col].mean())
            else:  # median
                if "position" in df.columns:
                    df[col] = df.groupby("position")[col].transform(
                        lambda s: s.fillna(s.median())
                    )
                    df[col] = df[col].fillna(df[col].median())
                else:
                    df[col] = df[col].fillna(df[col].median())
    return df


def scale_features(
    df: pd.DataFrame,
    feature_cols: list[str] | None = None,
    scaler: StandardScaler | None = None,
) -> tuple[pd.DataFrame, StandardScaler]:
    """
    Scale FEATURE_COLS with StandardScaler.

    Returns (scaled_df, fitted_scaler). If scaler is provided, uses it to
    transform (no fitting). Otherwise fits a new scaler.

    The returned DataFrame retains ID_COLS unscaled and scales only features.
    A new column-suffixed frame is not created; feature columns are replaced
    with scaled values in the copy.
    """
    if feature_cols is None:
        feature_cols = [c for c in FEATURE_COLS if c in df.columns]
    df = df.copy()
    # ensure no NaNs remain before scaling
    if df[feature_cols].isna().any().any():
        df = handle_missing(df)

    if scaler is None:
        scaler = StandardScaler()
        scaled_vals = scaler.fit_transform(df[feature_cols].values)
    else:
        scaled_vals = scaler.transform(df[feature_cols].values)

    df[feature_cols] = scaled_vals
    return df, scaler


def preprocess(
    csv_path: str | pathlib.Path = "data/players.csv",
    feature_cols: list[str] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, StandardScaler]:
    """
    Convenience: load -> handle_missing -> scale.

    Returns (original_filled_df, scaled_df, scaler).
    original_filled_df has missing values imputed but not scaled (for display).
    scaled_df has scaled features (for modeling).
    """
    df_raw = load_data(csv_path)
    df_filled = handle_missing(df_raw)
    df_scaled, scaler = scale_features(df_filled, feature_cols=feature_cols)
    return df_filled, df_scaled, scaler


def compute_percentiles(df: pd.DataFrame, feature_cols: list[str] | None = None) -> pd.DataFrame:
    """Convert each feature to percentile (0-100) for radar chart display."""
    if feature_cols is None:
        feature_cols = [c for c in FEATURE_COLS if c in df.columns]
    pct = df[feature_cols].rank(pct=True) * 100
    return pct
