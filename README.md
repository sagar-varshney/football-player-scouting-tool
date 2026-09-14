# Player Scouting Tool

Premier League scouting dashboard with a Python ML pipeline and a Next.js product UI.

## Important Data Note

The production UI uses real, free football data with explicit boundaries:

- Understat EPL player-seasons (`2021-2022` through `2025-2026`) power the current scouting model, percentiles, similarity search, and real shot-location maps.
- StatsBomb Open Data powers a separate historical EPL `2015/2016` Event Lab with recorded on-ball action coordinates.
- Shot locations are labelled as attempts, not touches. StatsBomb events are labelled as recorded actions, not touches.
- Defensive actions, pressures, progressive passes, and carries are never inferred for the Understat model when the source does not provide them.

The legacy synthetic generator remains in the repository for development, but it does not power the production Next.js payload.

## Stack

- Next.js / React / Recharts
- Pandas
- Scikit-Learn
- NumPy
- Streamlit (legacy prototype)

## Structure

```text
Player Scouting Tool/
├── app.py                 # Streamlit prototype/reference
├── data/
│   ├── generator.py
│   └── players.csv
├── frontend/              # Next.js production UI
│   ├── app/
│   ├── public/
│   │   ├── scouting-data.json
│   │   ├── shot-data/       # Lazy-loaded Understat shot files
│   │   └── event-lab/       # Lazy-loaded StatsBomb action files
│   └── package.json
├── scripts/
│   ├── build_free_data.py
│   ├── export_free_frontend_data.py
│   ├── build_understat_shot_data.py
│   └── build_statsbomb_event_lab.py
├── src/
│   ├── preprocessing.py
│   ├── scouting_engine.py
│   └── evaluate.py
├── requirements.txt
└── README.md
```

## Build the Free Production Data

```bash
python scripts/build_free_data.py
python scripts/export_free_frontend_data.py
python scripts/build_understat_shot_data.py
python scripts/build_statsbomb_event_lab.py
```

The location scripts cache per-player JSON in `frontend/public`, so the browser only downloads the selected player. Understat is a community data source rather than a guaranteed public API; keep the generated cache for reliable local use. StatsBomb data comes from the official [open-data repository](https://github.com/statsbomb/open-data).

## Run Dashboard

Streamlit prototype:

```bash
pip install -r requirements.txt
streamlit run app.py
```

Then open `http://localhost:8501`.

Next.js product UI:

```bash
cd frontend
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Features

- Main-page workflow controls for position, season, target player, and top-N matches.
- Premium responsive scouting workspace with season, position, and target controls.
- Overview cards for goals, xG, assists, xA, chance creation, and sequence involvement.
- Cosine similarity search over `StandardScaler`-scaled per-90 metrics.
- KMeans clustering for hidden similarity grouping plus position-aware row-level archetype labels.
- Real Understat shot-density maps for every cached player-season with attempts, plus xG-sized shot markers.
- A separate StatsBomb Open Event Lab covering 548 players and 380 EPL matches from `2015/2016`.
- Magenta/lime radar chart comparing percentile profiles.
- Metric percentile profile heatmaps for the target and closest matches.
- Scout-friendly 2-metric comparison map.
- Shortlist utility in the browser.

## Next Steps

- Add a licensed current-season event provider when true current touch, carry, pressure, and progressive-pass maps become affordable.
- Add competition/season switching to the StatsBomb Event Lab as more open coverage is released.
- Add role weights by position and recruitment constraints such as age, contract, and fee.
- Add shortlist export and player report generation.
- Deploy the Next.js UI on Vercel using precomputed Python JSON outputs.
