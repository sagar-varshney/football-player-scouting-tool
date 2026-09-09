# Player Scouting Tool

Premier League scouting dashboard with a Python ML pipeline and a Next.js product UI.

## Important Data Note

This project now uses the stronger local version from `/Users/sagarvarshney/Documents/player-scouting-app`.

The generated dataset is limited to Premier League clubs and uses real footballer names from a curated PL pool inspired by football-data.org squad data. The current working file covers completed seasons from `2021-2022` through `2025-2026`; the live/current season is intentionally excluded until we connect a live stats feed.

The advanced per-90 metrics are still generated because football-data.org does not provide xG, xA, key passes, dribbles, progressive passes, or defensive action profiles on its standard endpoints.

In short:

- Real PL player names and PL clubs.
- Generated model-ready scouting metrics.
- Optional football-data.org live squad seeding if you provide `FOOTBALL_DATA_TOKEN`.
- No fabricated random-name players.
- Row-level role archetypes that can change by player, position, club-season, and statistical profile.

## Stack

- Streamlit
- Pandas
- Scikit-Learn
- Matplotlib
- NumPy
- Requests

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
│   │   └── scouting-data.json
│   └── package.json
├── scripts/
│   └── export_frontend_data.py
├── src/
│   ├── preprocessing.py
│   ├── scouting_engine.py
│   └── evaluate.py
├── requirements.txt
└── README.md
```

## Generate Data

```bash
python data/generator.py --output data/players.csv --seed 42 --total 160
```

Completed-season working dataset:

```bash
python data/generator.py --source football-data --output data/players.csv --seed 42 --total 160 --seasons 2021-2026
python scripts/export_frontend_data.py
```

Optional football-data.org squad seeding:

```bash
export FOOTBALL_DATA_TOKEN="your-token"
python data/generator.py --source football-data --output data/players.csv
```

## Run Dashboard

Streamlit prototype:

```bash
pip install -r requirements.txt
streamlit run app.py
```

Then open `http://localhost:8501`.

Next.js product UI:

```bash
python scripts/export_frontend_data.py
cd frontend
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Features

- Main-page workflow controls for position, season, target player, and top-N matches.
- Overview cards for goals, xG, assists, xA, archetype, and passing.
- Cosine similarity search over `StandardScaler`-scaled per-90 metrics.
- KMeans clustering for hidden similarity grouping plus position-aware row-level archetype labels.
- Radar chart comparing percentile profiles.
- Scout-friendly 2-metric comparison map.
- Shortlist utility in the browser.

## Next Steps

- Connect a true event/stat provider for real xG, xA, carries, pressures, progressive pass data, and minutes.
- Review `DATA_SOURCES.md` before choosing the first real provider.
- Add club-season context, league minutes filters, and role weights by position.
- Add shortlist export and player report generation.
- Deploy the Next.js UI on Vercel using precomputed Python JSON outputs.
