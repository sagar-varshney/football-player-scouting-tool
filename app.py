"""Streamlit dashboard for the Football Player Scouting Tool."""

from __future__ import annotations

import html
import os
import pathlib
import subprocess
import sys

APP_DIR = pathlib.Path(__file__).resolve().parent
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))
os.environ.setdefault("MPLCONFIGDIR", str(APP_DIR / ".cache" / "matplotlib"))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import streamlit as st

try:
    import plotly.express as px
except ImportError:
    px = None

from src.preprocessing import FEATURE_COLS, compute_percentiles, preprocess
from src.scouting_engine import cluster_players, find_similar_players, get_pca_projection


DATA_CSV = APP_DIR / "data" / "players.csv"

RADAR_METRICS = [
    "goals_p90",
    "xg_p90",
    "shots_p90",
    "assists_p90",
    "xa_p90",
    "key_passes_p90",
    "dribbles_p90",
    "progressive_passes_p90",
    "pass_accuracy_pct",
    "tackles_interceptions_p90",
    "clearances_p90",
]

METRIC_LABELS = {
    "goals_p90": "Goals",
    "xg_p90": "xG",
    "shots_p90": "Shots",
    "assists_p90": "Assists",
    "xa_p90": "xA",
    "key_passes_p90": "Key Passes",
    "pass_accuracy_pct": "Pass Accuracy",
    "dribbles_p90": "Dribbles",
    "tackles_interceptions_p90": "Tkl + Int",
    "clearances_p90": "Clearances",
    "progressive_passes_p90": "Progressive Passes",
}

TABLE_RENAME = {
    "player_name": "Player",
    "position": "Position",
    "club": "Club",
    "archetype": "Archetype",
    "similarity_pct": "Similarity",
    "goals_p90": "Goals",
    "xg_p90": "xG",
    "assists_p90": "Ast",
    "xa_p90": "xA",
    "shots_p90": "Shots",
    "key_passes_p90": "KeyP",
    "pass_accuracy_pct": "Pass%",
    "dribbles_p90": "Drib",
    "tackles_interceptions_p90": "DefAct",
    "clearances_p90": "Clr",
    "progressive_passes_p90": "ProgP",
    "season": "Season",
}


st.set_page_config(
    page_title="Football Player Scouting Tool",
    page_icon="ST",
    layout="wide",
    initial_sidebar_state="expanded",
)


def inject_theme() -> None:
    st.markdown(
        """
        <style>
        :root {
            --surface: #f3f5f2;
            --panel: #ffffff;
            --ink: #101914;
            --muted: #607066;
            --line: #d8e0da;
            --green: #1d7a54;
            --green-2: #bdf4c7;
            --blue: #245a7b;
            --gold: #c48a28;
        }
        .stApp {
            background:
                linear-gradient(90deg, rgba(16,25,20,0.035) 1px, transparent 1px),
                linear-gradient(rgba(16,25,20,0.035) 1px, transparent 1px),
                var(--surface);
            background-size: 38px 38px;
            color: var(--ink);
        }
        [data-testid="stHeader"],
        [data-testid="stToolbar"] {
            background: transparent;
        }
        [data-testid="stSidebar"] {
            background: #111f18;
            border-right: 1px solid rgba(255,255,255,0.08);
        }
        [data-testid="stSidebar"] * {
            color: #edf7ef;
        }
        [data-testid="stSidebar"] label,
        [data-testid="stSidebar"] .stMarkdown p,
        [data-testid="stSidebar"] [data-testid="stCaptionContainer"] {
            color: #b8c9bd !important;
        }
        .block-container {
            max-width: 1500px;
            padding-top: 2rem;
            padding-bottom: 3rem;
        }
        h1, h2, h3 {
            letter-spacing: 0;
            color: var(--ink);
        }
        div[data-testid="stSelectbox"] > label,
        div[data-testid="stRadio"] > label,
        div[data-testid="stSlider"] > label {
            font-weight: 760;
        }
        .brand-lockup {
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.06);
            border-radius: 8px;
            padding: 16px;
            margin: 6px 0 20px;
        }
        .brand-row {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .brand-mark {
            display: grid;
            place-items: center;
            width: 42px;
            height: 42px;
            border-radius: 8px;
            background: var(--green-2);
            color: #102016 !important;
            font-weight: 900;
        }
        .brand-name {
            margin: 0;
            color: #ffffff !important;
            font-size: 1.04rem;
            font-weight: 850;
            line-height: 1.1;
        }
        .brand-subtitle {
            margin: 2px 0 0;
            color: #afc1b5 !important;
            font-size: 0.8rem;
        }
        .sidebar-note {
            border-top: 1px solid rgba(255,255,255,0.12);
            margin-top: 18px;
            padding-top: 14px;
            color: #afc1b5 !important;
            font-size: 0.82rem;
            line-height: 1.45;
        }
        .hero {
            position: relative;
            overflow: hidden;
            min-height: 292px;
            padding: 34px;
            border-radius: 8px;
            border: 1px solid rgba(16,25,20,0.1);
            background:
                linear-gradient(135deg, rgba(15,36,26,0.95), rgba(28,91,65,0.86)),
                repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0 2px, transparent 2px 96px);
            box-shadow: 0 24px 70px rgba(23, 40, 30, 0.18);
            margin-bottom: 18px;
        }
        .hero:after {
            content: "";
            position: absolute;
            right: 34px;
            bottom: -56px;
            width: min(42vw, 560px);
            height: min(42vw, 560px);
            border: 1px solid rgba(189,244,199,0.28);
            border-radius: 50%;
            box-shadow: inset 0 0 0 48px rgba(189,244,199,0.05);
        }
        .hero-content {
            position: relative;
            z-index: 1;
            max-width: 900px;
        }
        .kicker {
            color: var(--green-2);
            font-size: 0.78rem;
            font-weight: 850;
            text-transform: uppercase;
            margin-bottom: 12px;
        }
        .hero h1 {
            color: #ffffff;
            font-size: clamp(2.4rem, 5vw, 5.35rem);
            line-height: 0.94;
            margin: 0 0 16px;
        }
        .hero p {
            max-width: 720px;
            margin: 0;
            color: #d8e6dc;
            font-size: 1.05rem;
            line-height: 1.6;
        }
        .hero-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 22px;
        }
        .pill {
            display: inline-flex;
            align-items: center;
            min-height: 34px;
            border-radius: 999px;
            padding: 0 12px;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.16);
            color: #f4fbf5;
            font-size: 0.84rem;
            font-weight: 760;
        }
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 18px;
        }
        .kpi-card,
        .analysis-card,
        .match-card {
            background: rgba(255,255,255,0.92);
            border: 1px solid var(--line);
            border-radius: 8px;
            box-shadow: 0 18px 42px rgba(25, 38, 30, 0.08);
        }
        .kpi-card {
            padding: 16px;
            min-height: 118px;
        }
        .kpi-card span {
            display: block;
            color: var(--muted);
            font-size: 0.74rem;
            font-weight: 850;
            text-transform: uppercase;
        }
        .kpi-card strong {
            display: block;
            margin-top: 9px;
            color: var(--ink);
            font-size: 1.7rem;
            line-height: 1.05;
            word-break: break-word;
        }
        .kpi-card small {
            display: block;
            margin-top: 8px;
            color: var(--muted);
            font-size: 0.82rem;
        }
        .section-label {
            color: var(--green);
            font-size: 0.78rem;
            font-weight: 850;
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        .analysis-card {
            padding: 20px;
            margin-bottom: 18px;
        }
        .analysis-card h3 {
            margin: 0 0 8px;
            font-size: 1.18rem;
        }
        .analysis-card p {
            margin: 0;
            color: #3c4d43;
            line-height: 1.65;
        }
        .match-strip {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 10px;
            margin: 8px 0 18px;
        }
        .match-card {
            padding: 13px;
        }
        .match-card strong {
            display: block;
            font-size: 0.95rem;
            line-height: 1.2;
            color: var(--ink);
        }
        .match-card span {
            display: block;
            margin-top: 5px;
            color: var(--muted);
            font-size: 0.78rem;
        }
        .score {
            display: inline-flex !important;
            margin-top: 10px !important;
            padding: 5px 8px;
            border-radius: 999px;
            background: #e6f5e8;
            color: #135638 !important;
            font-weight: 850;
        }
        [data-testid="stDataFrame"] {
            border: 1px solid var(--line);
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 18px 42px rgba(25, 38, 30, 0.08);
        }
        .stTabs [data-baseweb="tab-list"] {
            gap: 8px;
        }
        .stTabs [data-baseweb="tab"] {
            border-radius: 8px;
            border: 1px solid var(--line);
            background: #ffffff;
            padding: 8px 14px;
        }
        .stTabs [aria-selected="true"] {
            background: #12251c !important;
            color: #ffffff !important;
        }
        @media (max-width: 1100px) {
            .kpi-grid,
            .match-strip {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }
        @media (max-width: 720px) {
            .hero {
                padding: 24px;
            }
            .kpi-grid,
            .match-strip {
                grid-template-columns: 1fr;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


@st.cache_data(show_spinner=False)
def load_and_prepare(k: int):
    df_filled, df_scaled, _ = preprocess(DATA_CSV)
    df_clustered, _, _ = cluster_players(df_scaled, k=k)

    df_display = df_filled.copy()
    df_display["cluster"] = df_clustered["cluster"].values
    df_display["archetype"] = df_clustered["archetype"].values

    projection, pca = get_pca_projection(df_scaled)
    df_display["pca_x"] = projection[:, 0]
    df_display["pca_y"] = projection[:, 1]

    percentiles = compute_percentiles(df_filled, feature_cols=RADAR_METRICS)
    for metric in RADAR_METRICS:
        df_display[f"{metric}_pct"] = percentiles[metric].values

    return df_display, df_scaled, df_clustered, pca


def ensure_data() -> None:
    if DATA_CSV.exists():
        return

    st.warning("`data/players.csv` not found. Generating Premier League scouting data.")
    generator = APP_DIR / "data" / "generator.py"
    result = subprocess.run(
        [sys.executable, str(generator), "--output", str(DATA_CSV), "--total", "160"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        st.error(f"Data generation failed:\n{result.stderr}")
        st.stop()
    st.cache_data.clear()


def esc(value: object) -> str:
    return html.escape(str(value))


def kpi_card(label: str, value: object, detail: str = "") -> str:
    return (
        '<div class="kpi-card">'
        f"<span>{esc(label)}</span>"
        f"<strong>{esc(value)}</strong>"
        f"<small>{esc(detail)}</small>"
        "</div>"
    )


def format_float(value: object, digits: int = 2) -> str:
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return str(value)


def scout_summary(target_row: pd.Series, similar_display: pd.DataFrame) -> str:
    best = similar_display.iloc[0]
    attacking = float(target_row["goals_p90"] + target_row["xg_p90"] + target_row["shots_p90"] / 5)
    creation = float(target_row["assists_p90"] + target_row["xa_p90"] + target_row["key_passes_p90"] / 4)
    progression = float(target_row["dribbles_p90"] / 4 + target_row["progressive_passes_p90"] / 8)
    defensive = float(target_row["tackles_interceptions_p90"] / 5 + target_row["clearances_p90"] / 6)
    signals = {
        "attacking output": attacking,
        "chance creation": creation,
        "ball progression": progression,
        "defensive volume": defensive,
    }
    top_signals = sorted(signals, key=signals.get, reverse=True)[:2]
    return (
        f"{target_row['player_name']} profiles as a {target_row['archetype']} for {target_row['club']}. "
        f"The model sees the strongest signals in {top_signals[0]} and {top_signals[1]}. "
        f"The closest match in the selected pool is {best['player_name']} at "
        f"{best['similarity_pct']:.1f}% similarity, which makes them the best statistical style "
        "comparison under the current filters."
    )


def match_cards(similar_display: pd.DataFrame) -> str:
    cards = []
    for _, row in similar_display.head(5).iterrows():
        cards.append(
            '<div class="match-card">'
            f"<strong>{esc(row['player_name'])}</strong>"
            f"<span>{esc(row['club'])} · {esc(row['position'])}</span>"
            f"<span>{esc(row['archetype'])}</span>"
            f'<span class="score">{float(row["similarity_pct"]):.1f}% match</span>'
            "</div>"
        )
    return '<div class="match-strip">' + "".join(cards) + "</div>"


def render_radar(target_row: pd.Series, comparison_row: pd.Series, target_name: str, comparison_name: str):
    labels = [METRIC_LABELS[metric] for metric in RADAR_METRICS]
    target_values = [float(target_row[f"{metric}_pct"]) for metric in RADAR_METRICS]
    comparison_values = [float(comparison_row[f"{metric}_pct"]) for metric in RADAR_METRICS]

    angles = np.linspace(0, 2 * np.pi, len(labels), endpoint=False).tolist()
    angles += angles[:1]
    target_values += target_values[:1]
    comparison_values += comparison_values[:1]

    fig, ax = plt.subplots(figsize=(6.2, 6.2), subplot_kw={"polar": True})
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#f8faf8")
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_ylim(0, 100)
    ax.set_yticks([25, 50, 75, 100])
    ax.set_yticklabels(["25", "50", "75", "100"], fontsize=8, color="#607066")
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=8)
    ax.grid(color="#aab7af", alpha=0.35, linewidth=0.7)
    ax.spines["polar"].set_color("#cfd8d3")

    ax.plot(angles, target_values, color="#1d7a54", linewidth=2.6, label=target_name)
    ax.fill(angles, target_values, color="#1d7a54", alpha=0.2)
    ax.plot(angles, comparison_values, color="#245a7b", linewidth=2.4, label=comparison_name)
    ax.fill(angles, comparison_values, color="#245a7b", alpha=0.14)
    ax.legend(loc="upper right", bbox_to_anchor=(1.23, 1.12), fontsize=8, frameon=False)
    fig.tight_layout()
    return fig


def render_pca_map(df_display: pd.DataFrame, target_player: str, similar_display: pd.DataFrame) -> None:
    plot_df = df_display.copy()
    match_names = set(similar_display["player_name"])
    plot_df["Highlight"] = "Player Pool"
    plot_df.loc[plot_df["player_name"].isin(match_names), "Highlight"] = "Closest Matches"
    plot_df.loc[plot_df["player_name"] == target_player, "Highlight"] = "Target"

    if px is None:
        st.scatter_chart(plot_df, x="pca_x", y="pca_y", color="archetype")
        return

    fig = px.scatter(
        plot_df,
        x="pca_x",
        y="pca_y",
        color="archetype",
        symbol="Highlight",
        hover_data=["player_name", "club", "position", "archetype"],
        height=560,
        template="plotly_white",
    )
    fig.update_traces(marker={"size": 10, "line": {"width": 1, "color": "white"}})
    fig.update_layout(
        margin={"l": 10, "r": 10, "t": 24, "b": 10},
        legend_title_text="",
        paper_bgcolor="#ffffff",
        plot_bgcolor="#f8faf8",
        xaxis_title="PCA 1",
        yaxis_title="PCA 2",
    )
    st.plotly_chart(fig, width="stretch")


def render_metric_map(
    df_display: pd.DataFrame,
    target_row: pd.Series,
    similar_display: pd.DataFrame,
    x_metric: str,
    y_metric: str,
    color_by: str,
) -> None:
    group_col = "position" if color_by == "Position" else "archetype"
    fig, ax = plt.subplots(figsize=(6.4, 5.7))
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#f8faf8")

    palette = plt.get_cmap("tab10")
    for index, group in enumerate(sorted(df_display[group_col].unique())):
        subset = df_display[df_display[group_col] == group]
        ax.scatter(
            subset[x_metric],
            subset[y_metric],
            s=42,
            alpha=0.58,
            label=group,
            color=palette(index % 10),
            edgecolors="white",
            linewidths=0.5,
        )

    ax.scatter(
        target_row[x_metric],
        target_row[y_metric],
        s=260,
        facecolors="none",
        edgecolors="#101914",
        linewidths=2.4,
        zorder=6,
    )
    ax.scatter(target_row[x_metric], target_row[y_metric], s=100, color="#101914", marker="*", zorder=7)
    ax.annotate(
        target_row["player_name"],
        (target_row[x_metric], target_row[y_metric]),
        fontsize=8,
        fontweight="bold",
        xytext=(7, 7),
        textcoords="offset points",
        bbox={"boxstyle": "round,pad=0.3", "fc": "#bdf4c7", "alpha": 0.96, "ec": "#101914", "lw": 0.7},
    )

    for _, row in similar_display.iterrows():
        full = df_display[df_display["player_name"] == row["player_name"]].iloc[0]
        ax.scatter(
            full[x_metric],
            full[y_metric],
            s=140,
            facecolors="none",
            edgecolors="#c48a28",
            linewidths=2,
            zorder=5,
        )
        ax.annotate(
            full["player_name"],
            (full[x_metric], full[y_metric]),
            fontsize=7,
            xytext=(5, 5),
            textcoords="offset points",
            bbox={"boxstyle": "round,pad=0.2", "fc": "white", "alpha": 0.9, "ec": "#c48a28", "lw": 0.7},
        )

    ax.set_xlabel(METRIC_LABELS[x_metric])
    ax.set_ylabel(METRIC_LABELS[y_metric])
    ax.grid(alpha=0.2)
    ax.legend(fontsize=7, loc="best", framealpha=0.9)
    fig.tight_layout()
    st.pyplot(fig, width="stretch")
    plt.close(fig)


def style_similarity(value: float) -> str:
    if value >= 85:
        return "background-color: #dff4e4; color: #105936; font-weight: 800"
    if value >= 70:
        return "background-color: #fbefd2; color: #77510e; font-weight: 800"
    return ""


def main() -> None:
    inject_theme()
    ensure_data()

    st.sidebar.markdown(
        """
        <div class="brand-lockup">
          <div class="brand-row">
            <div class="brand-mark">ST</div>
            <div>
              <p class="brand-name">Scouting Tool</p>
              <p class="brand-subtitle">Premier League similarity lab</p>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    k_choice = st.sidebar.segmented_control("Role clusters", options=[4, 5], default=5)
    df_display_full, df_scaled_full, _, pca = load_and_prepare(k=k_choice)

    if "season" in df_display_full.columns:
        season_options = ["All seasons"] + sorted(df_display_full["season"].dropna().unique().tolist())
        selected_season = st.sidebar.selectbox("Season", options=season_options, index=len(season_options) - 1)
        if selected_season == "All seasons":
            df_display = df_display_full.copy()
            df_scaled = df_scaled_full.copy()
        else:
            df_display = df_display_full[df_display_full["season"] == selected_season].copy()
            df_scaled = df_scaled_full[df_scaled_full["season"] == selected_season].copy()
        df_display["label"] = df_display["player_name"] + " (" + df_display["season"] + ") · " + df_display["club"]
        df_scaled["label"] = df_scaled["player_name"] + " (" + df_scaled["season"] + ") · " + df_scaled["club"]
        use_label = True
    else:
        selected_season = None
        df_display = df_display_full.copy()
        df_scaled = df_scaled_full.copy()
        use_label = False

    positions = ["All", *sorted(df_display["position"].unique())]
    position_filter = st.sidebar.selectbox("Position", options=positions)
    list_df = df_display[df_display["position"] == position_filter] if position_filter != "All" else df_display

    if use_label:
        list_df = list_df.sort_values(["player_name", "season"])
        target_label = st.sidebar.selectbox("Target player", options=list_df["label"].tolist())
        target_row = df_display[df_display["label"] == target_label].iloc[0]
        target_player = target_row["player_name"]
    else:
        player_names = list_df["player_name"].sort_values().tolist()
        default_index = player_names.index("Bukayo Saka") if "Bukayo Saka" in player_names else 0
        target_player = st.sidebar.selectbox("Target player", options=player_names, index=default_index)
        target_label = target_player
        target_row = df_display[df_display["player_name"] == target_player].iloc[0]

    top_n = st.sidebar.segmented_control("Matches", options=[3, 5, 10], default=5)
    same_position = st.sidebar.toggle("Same-position matches only", value=True)
    position_filter_for_sim = target_row["position"] if same_position else None

    st.sidebar.markdown(
        f"""
        <p class="sidebar-note">
        Dataset: {len(df_display)} PL rows<br>
        Model: StandardScaler + KMeans + cosine similarity<br>
        PCA variance: {pca.explained_variance_ratio_.sum():.1%}
        </p>
        """,
        unsafe_allow_html=True,
    )

    if use_label and selected_season == "All seasons":
        df_scaled_for_sim = df_scaled.copy()
        df_scaled_for_sim["player_name"] = df_scaled_for_sim["label"]
        sim_target = target_label
        df_display_keyed = df_display.copy()
        df_display_keyed["player_name"] = df_display_keyed["label"]
    else:
        df_scaled_for_sim = df_scaled
        sim_target = target_player
        df_display_keyed = df_display

    similar_df = find_similar_players(
        df_scaled_for_sim,
        target_player=sim_target,
        top_n=top_n,
        position_filter=position_filter_for_sim,
    )

    display_cols = ["player_name", "position", "club", "age", "archetype", "cluster", *FEATURE_COLS]
    if "season" in df_display_keyed.columns:
        display_cols.insert(5, "season")

    similar_display = similar_df[["player_name", "similarity", "similarity_pct"]].merge(
        df_display_keyed[display_cols],
        on="player_name",
        how="left",
    )
    if use_label and selected_season == "All seasons":
        similar_display["player_name"] = similar_display["player_name"].str.extract(r"^(.*) \(")[0].fillna(
            similar_display["player_name"]
        )

    st.markdown(
        f"""
        <section class="hero">
          <div class="hero-content">
            <div class="kicker">Premier League Recruitment Intelligence</div>
            <h1>{esc(target_player)}</h1>
            <p>{esc(target_row['club'])} · {esc(target_row['position'])} · age {int(target_row['age'])}. Search statistical playing-style matches, inspect role clusters, and compare percentile profiles from one scouting workspace.</p>
            <div class="hero-meta">
              <span class="pill">{esc(target_row['archetype'])}</span>
              <span class="pill">Cluster {int(target_row['cluster'])}</span>
              <span class="pill">Top {int(top_n)} matches</span>
              <span class="pill">{'Same position pool' if same_position else 'All-position pool'}</span>
            </div>
          </div>
        </section>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        '<div class="kpi-grid">'
        + kpi_card("Goals /90", format_float(target_row["goals_p90"]), f"xG {format_float(target_row['xg_p90'])}")
        + kpi_card("Assists /90", format_float(target_row["assists_p90"]), f"xA {format_float(target_row['xa_p90'])}")
        + kpi_card("Creation", format_float(target_row["key_passes_p90"]), "key passes /90")
        + kpi_card("Ball Carrying", format_float(target_row["dribbles_p90"]), "dribbles /90")
        + kpi_card("Defensive Work", format_float(target_row["tackles_interceptions_p90"]), "tackles + interceptions /90")
        + "</div>",
        unsafe_allow_html=True,
    )

    st.markdown(
        f"""
        <div class="analysis-card">
          <div class="section-label">Model Read</div>
          <h3>Why this profile matters</h3>
          <p>{esc(scout_summary(target_row, similar_display))}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown('<div class="section-label">Closest Statistical Matches</div>', unsafe_allow_html=True)
    st.markdown(match_cards(similar_display), unsafe_allow_html=True)

    table_cols = ["player_name", "position", "club", "archetype", "similarity_pct", *FEATURE_COLS]
    if "season" in similar_display.columns:
        table_cols.insert(1, "season")
    table = similar_display[table_cols].rename(columns=TABLE_RENAME)
    numeric_format = {
        "Similarity": "{:.1f}%",
        "Goals": "{:.2f}",
        "xG": "{:.2f}",
        "Ast": "{:.2f}",
        "xA": "{:.2f}",
        "Shots": "{:.2f}",
        "KeyP": "{:.2f}",
        "Pass%": "{:.1f}",
        "Drib": "{:.2f}",
        "DefAct": "{:.2f}",
        "Clr": "{:.2f}",
        "ProgP": "{:.2f}",
    }
    styled_table = table.style.format(numeric_format).map(style_similarity, subset=["Similarity"])
    st.dataframe(styled_table, width="stretch", height=300)

    tab_radar, tab_pca, tab_metrics, tab_clusters = st.tabs(
        ["Radar Comparison", "PCA Player Map", "Metric Map", "Cluster Profiles"]
    )

    with tab_radar:
        radar_options = similar_display["player_name"].tolist()
        selected_compare = st.selectbox(
            "Compare target with",
            options=radar_options,
            format_func=lambda name: (
                f"{name} ({similar_display.loc[similar_display['player_name'] == name, 'similarity_pct'].iloc[0]:.1f}%)"
            ),
        )
        comparison_row = df_display[df_display["player_name"] == selected_compare].iloc[0]
        st.pyplot(render_radar(target_row, comparison_row, target_player, selected_compare), width="stretch")

        raw_compare = pd.DataFrame(
            {
                "Metric": [METRIC_LABELS[metric] for metric in RADAR_METRICS],
                target_player: [target_row[metric] for metric in RADAR_METRICS],
                selected_compare: [comparison_row[metric] for metric in RADAR_METRICS],
            }
        )
        st.dataframe(raw_compare, width="stretch", hide_index=True)

    with tab_pca:
        st.caption("Two-dimensional PCA projection of the scaled scouting profile. Target and closest matches are highlighted.")
        render_pca_map(df_display, target_player, similar_display)

    with tab_metrics:
        default_x, default_y = "goals_p90", "assists_p90"
        if target_row["position"] == "Defender":
            default_x, default_y = "tackles_interceptions_p90", "clearances_p90"
        elif target_row["position"] == "Winger":
            default_x, default_y = "dribbles_p90", "key_passes_p90"

        col_x, col_y, col_color = st.columns([1, 1, 1])
        x_metric = col_x.selectbox(
            "X-axis",
            options=FEATURE_COLS,
            index=FEATURE_COLS.index(default_x),
            format_func=lambda metric: METRIC_LABELS[metric],
        )
        y_metric = col_y.selectbox(
            "Y-axis",
            options=FEATURE_COLS,
            index=FEATURE_COLS.index(default_y),
            format_func=lambda metric: METRIC_LABELS[metric],
        )
        color_by = col_color.radio("Color by", options=["Position", "Archetype"], horizontal=True)
        render_metric_map(df_display, target_row, similar_display, x_metric, y_metric, color_by)

    with tab_clusters:
        cluster_sizes = (
            df_display.groupby(["cluster", "archetype"])
            .size()
            .reset_index(name="players")
            .sort_values(["cluster", "players"], ascending=[True, False])
        )
        cluster_profile = (
            df_display.groupby("archetype")[FEATURE_COLS]
            .mean()
            .round(2)
            .rename(columns=TABLE_RENAME)
            .reset_index()
            .rename(columns={"archetype": "Archetype"})
        )
        left, right = st.columns([0.72, 1.28], gap="large")
        with left:
            st.dataframe(cluster_sizes, width="stretch", hide_index=True)
        with right:
            st.dataframe(cluster_profile, width="stretch", hide_index=True)

    with st.expander("Target player raw metrics"):
        st.dataframe(
            target_row[FEATURE_COLS].to_frame(name="value").T.rename(columns=METRIC_LABELS).style.format("{:.2f}"),
            width="stretch",
        )

    st.caption(
        "Data note: PL names and clubs are real/curated; advanced scouting metrics are generated until a richer event-data source is connected."
    )


if __name__ == "__main__":
    main()
