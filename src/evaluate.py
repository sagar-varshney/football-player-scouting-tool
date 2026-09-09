"""
Evaluation harness for Player Scouting Engine.

Covers:
  - Data leakage check (StandardScaler fit on train only)
  - Train/test split for unsupervised (KMeans stability) + supervised (position prediction)
  - Overfitting / underfitting via train vs test metrics
  - Model comparison: LogisticRegression, RandomForest, XGBoost (if installed)
  - Why LSTM is not suitable for this tabular data (and how it would look)
Run:
  python src/evaluate.py
  python src/evaluate.py --test-size 0.25 --k 4
"""
from __future__ import annotations

import argparse
import pathlib
import sys

APP_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, silhouette_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, learning_curve, train_test_split
from sklearn.preprocessing import StandardScaler

from src.preprocessing import FEATURE_COLS, handle_missing, load_data

# Optional deps — degrade gracefully if not installed
try:
    import xgboost as xgb
    HAS_XGB = True
except Exception:
    HAS_XGB = False
    xgb = None

try:
    import torch
    HAS_TORCH = True
except Exception:
    HAS_TORCH = False


def check_leakage(df: pd.DataFrame, feature_cols: list[str], test_size: float = 0.2, seed: int = 42):
    """Show leakage risk: global fit vs train-only fit."""
    df_train, df_test = train_test_split(df, test_size=test_size, random_state=seed, stratify=df["position"])

    # Leaky: fit on full data (what preprocess() currently does)
    scaler_leaky = StandardScaler().fit(df[feature_cols].to_numpy())
    # Clean: fit on train only
    scaler_clean = StandardScaler().fit(df_train[feature_cols].to_numpy())

    diff = np.abs(scaler_leaky.mean_ - scaler_clean.mean_).max()
    print("\n=== Data Leakage Check ===")
    print(f"Max |mean_leaky - mean_clean|: {diff:.5f}")
    print(f"Leaky means (first 3): {scaler_leaky.mean_[:3].round(3)}")
    print(f"Clean means (first 3): {scaler_clean.mean_[:3].round(3)}")
    if diff > 1e-6:
        print("⚠️  preprocess() does fit_transform on full data — leakage if you later split.")
        print("   Fix: fit scaler on train only, transform test with that scaler (as done below).")
    else:
        print("✓ No meaningful difference (tiny dataset variance). Still, use train-only fit for rigor.")
    return df_train, df_test, scaler_clean


def evaluate_clustering(df_train: pd.DataFrame, df_test: pd.DataFrame, scaler: StandardScaler, feature_cols: list[str], k: int = 4):
    X_train = scaler.transform(df_train[feature_cols].to_numpy())
    X_test = scaler.transform(df_test[feature_cols].to_numpy())

    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    train_labels = km.fit_predict(X_train)
    test_labels = km.predict(X_test)

    # Inertia and silhouette (train vs test)
    sil_train = silhouette_score(X_train, train_labels) if len(set(train_labels)) > 1 else float("nan")
    sil_test = silhouette_score(X_test, test_labels) if len(set(test_labels)) > 1 else float("nan")

    print("\n=== Clustering (KMeans) Stability — Train/Test ===")
    print(f"k={k} | inertia train: {km.inertia_:.1f}")
    print(f"Silhouette train: {sil_train:.3f} | test: {sil_test:.3f} | delta: {abs(sil_train - sil_test):.3f}")
    # Heuristic for overfitting: large delta or test << train
    if sil_test < sil_train - 0.10:
        print("→ Possible overfitting: test sil much lower than train (clusters not generalizing). Try smaller k or fewer features.")
    elif sil_train < 0.15 and sil_test < 0.15:
        print("→ Both sil low (<0.15): underfitting — k too small or features not clusterable (try elbow analysis).")
    else:
        print("→ Stable: train/test silhouette close — no strong over/underfitting signal.")

    # Elbow + silhouette for k=2..8 on full clean pipeline
    print("\nElbow / Silhouette sweep (train only):")
    for kk in range(2, 9):
        km2 = KMeans(n_clusters=kk, random_state=42, n_init=10).fit(X_train)
        sil = silhouette_score(X_train, km2.labels_) if kk > 1 else float("nan")
        print(f"  k={kk}: inertia={km2.inertia_:.0f}  silhouette={sil:.3f}")

    return km, X_train, X_test


def evaluate_supervised(df_train: pd.DataFrame, df_test: pd.DataFrame, scaler: StandardScaler, feature_cols: list[str]):
    """Treat position prediction as supervised proxy — enables real overfit test."""
    X_train = scaler.transform(df_train[feature_cols].to_numpy())
    X_test = scaler.transform(df_test[feature_cols].to_numpy())
    y_train = df_train["position"].to_numpy()
    y_test = df_test["position"].to_numpy()

    models: dict[str, object] = {
        "LogReg": LogisticRegression(max_iter=500),
        "RandomForest": RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1),
    }
    if HAS_XGB:
        models["XGBoost"] = xgb.XGBClassifier(
            n_estimators=200, max_depth=4, learning_rate=0.1, subsample=0.8,
            eval_metric="mlogloss", random_state=42, n_jobs=-1
        )
    else:
        print("\n(XGBoost not installed — skipping. Install with: pip install xgboost)")

    print("\n=== Supervised Proxy: Predict position from per-90 metrics ===")
    print("Purpose: real train/test overfitting check. High train ≫ test = overfit; both low = underfit.")

    for name, clf in models.items():
        clf.fit(X_train, y_train)
        tr_acc = accuracy_score(y_train, clf.predict(X_train))
        te_acc = accuracy_score(y_test, clf.predict(X_test))
        gap = tr_acc - te_acc
        print(f"\n{name}: train acc {tr_acc:.3f} | test acc {te_acc:.3f} | gap {gap:+.3f}")
        if gap > 0.12:
            print("  → Overfitting (gap >0.12). Try regularization, fewer trees, or cross-val.")
        elif te_acc < 0.60:
            print("  → Underfitting (test <0.60). Try more capacity or engineered features.")
        else:
            print("  → Balanced fit.")
        print(classification_report(y_test, clf.predict(X_test), zero_division=0, digits=3))

        # 5-fold CV on train
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        cv_scores = cross_val_score(clf, X_train, y_train, cv=cv, scoring="accuracy")
        print(f"  5-fold CV mean {cv_scores.mean():.3f} ± {cv_scores.std():.3f} (train)")

        # Learning curve for RF/XGB (sample)
        if name in ("RandomForest", "XGBoost"):
            train_sizes, tr_scores, val_scores = learning_curve(
                clf, X_train, y_train, cv=cv, train_sizes=np.linspace(0.2, 1.0, 4), scoring="accuracy", n_jobs=-1
            )
            print(f"  Learning curve: train sizes {train_sizes} | val mean {[f'{v:.3f}' for v in val_scores.mean(axis=1)]}")


def explain_lstm():
    print("\n=== LSTM / Sequence models — Why not here ===")
    print("Current data: one row per player, 11 tabular per-90 features, no time dimension.")
    print("LSTM expects shape (batch, seq_len, features) — e.g., 20 matches per player over time.")
    print("If you had time-series (matchday sequence):")
    print("  X shape would be (n_players, n_matchdays, 11) and LSTM would predict next-match xG or position.")
    print("With tabular data, LSTM = overkill + will overfit (few samples, many params).")
    if HAS_TORCH:
        print("Torch is installed — example LSTM stub: nn.LSTM(input_size=11, hidden_size=32) over seq_len.")
        print("But you would need to synthetically window your data or collect match-by-match logs.")
    else:
        print("Torch not installed (pip install torch) — not needed for this app.")
    print("Recommendation: for this dataset, use XGBoost/RandomForest. For LSTM, first build a")
    print("  time-series dataset: (player, matchday) rows from football-data.org /v4/persons/{id}/matches")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--k", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    df_raw = load_data(APP_DIR / "data" / "players.csv")
    df = handle_missing(df_raw)
    feature_cols = [c for c in FEATURE_COLS if c in df.columns]

    print(f"Dataset: {len(df)} players, {len(feature_cols)} features, positions: {df['position'].value_counts().to_dict()}")
    print(f"Features: {feature_cols}")

    # Leakage + split
    df_train, df_test, scaler_clean = check_leakage(df, feature_cols, test_size=args.test_size, seed=args.seed)

    # Clustering eval
    evaluate_clustering(df_train, df_test, scaler_clean, feature_cols, k=args.k)

    # Supervised proxy for real overfit test
    evaluate_supervised(df_train, df_test, scaler_clean, feature_cols)

    # LSTM guidance
    explain_lstm()

    print("\n=== Summary ===")
    print("• Leakage: fix by fitting scaler on train only (demo above).")
    print("• Overfit: train acc ≫ test acc or train sil ≫ test sil.")
    print("• Underfit: both accuracies/sil low. Adjust k or model capacity.")
    print("• XGBoost vs LogReg/RF: run the above table; pick smallest test gap with high test acc.")
    print("• LSTM: only after you have sequential data (per-match). Not for current 1-row-per-player table.")


if __name__ == "__main__":
    main()
