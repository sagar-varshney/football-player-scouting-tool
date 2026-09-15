# Football Player Scouting Tool

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Data](https://img.shields.io/badge/data-free%20football%20sources-b8ff3d)](#data-coverage-and-limitations)

An interactive Premier League recruitment workspace for discovering comparable players, understanding playing profiles, and exploring where players shoot and operate on the pitch.

The project combines a Python data and machine-learning pipeline with a responsive Next.js dashboard. It is built entirely from free data and keeps source limitations visible instead of presenting estimates as recorded events.

## What you can do

- Find the closest stylistic matches for a selected player and season.
- Compare percentile profiles with an overlaid radar chart.
- Scan player strengths across an entire comparison group with a metric heatmap.
- Explore real Understat shot-density maps and individual shot locations.
- Inspect recorded on-ball activity from StatsBomb Open Data.
- Compare players on any two available performance measures.
- Save up to 12 players to a browser-based shortlist.
- Filter the workspace by position, season, target player, and result count.

## Current coverage

| Dataset | Coverage in this repository | Used for |
| --- | --- | --- |
| Understat | 1,854 EPL player-season profiles across 2021/22–2025/26, filtered to 450+ minutes | Similarity, percentiles, radar charts, role labels, and season profiles |
| Understat shots | 48,492 attempts across 819 cached player files | Shot density, shot locations, goals, xG, and shot selection |
| StatsBomb Open Data | 380 EPL matches and 548 players from 2015/16 | Recorded-action heatmaps and action-type summaries |

Goalkeepers are excluded from the current similarity model. The primary feature set is attacking and creative because that is what the free Understat source supports consistently.

### Optional API-Football enrichment

The repository includes a quota-safe API-Football pipeline for evaluating defensive and availability data before adding it to the model. It caches every page, preserves missing values, writes a coverage report, and stops at 80 requests per UTC day by default.

```bash
export API_FOOTBALL_KEY="your_key"
python3 scripts/build_api_football_enrichment.py --seasons 2025
```

Alternatively, copy `.env.example` to `.env` and place the key there; `.env` is ignored by Git.

For a one-page coverage test that uses at most one request:

```bash
python3 scripts/build_api_football_enrichment.py --seasons 2025 --max-pages 1
```

Raw and normalized API-Football data stay out of Git. The key is read only from the environment and is never written to generated files. Defensive fields are not activated in similarity until the quality report shows at least 80% coverage for the relevant season and position.

## How the analysis works

```mermaid
flowchart LR
    A[Understat player seasons] --> B[Cleaning and 450-minute filter]
    B --> C[Per-90 features]
    C --> D[StandardScaler]
    D --> E[Cosine similarity]
    D --> F[KMeans clusters]
    C --> G[Position-aware percentiles]
    G --> H[Readable role archetypes]
    E --> I[Next.js scouting workspace]
    F --> I
    H --> I
    J[Understat shots] --> K[Shot maps]
    L[StatsBomb Open Data] --> M[Action maps]
    K --> I
    M --> I
```

The production export uses eight per-90 features: goals, xG, assists, xA, shots, key passes, xGChain, and xGBuildup. Features are standardized before a five-cluster KMeans model is fitted. Similarity is calculated with cosine similarity in standardized feature space. Human-readable archetypes are assigned from position-aware percentile rules, while radar and heatmap values use percentile ranks for easier interpretation.

The browser consumes precomputed JSON, so exploring players does not require a live Python server or external API calls.

## Run locally

### Web application

```bash
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Create a production build with:

```bash
cd frontend
pnpm build
pnpm start
```

### Python prototype

The original Streamlit interface remains available as a reference implementation:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

Open [http://localhost:8501](http://localhost:8501).

## Refresh the data

The generated frontend assets are committed, so refreshing data is optional for normal local use.

```bash
python3 scripts/build_free_data.py
python3 scripts/export_free_frontend_data.py
python3 scripts/build_understat_shot_data.py
python3 scripts/build_statsbomb_event_lab.py
```

You can also run the frontend shortcuts:

```bash
cd frontend
pnpm export-data
pnpm refresh-api-football
pnpm refresh-shot-data
pnpm refresh-event-lab
```

Understat is accessed through an unofficial community endpoint, so the repository keeps a local cache and the refresh scripts should be run sparingly. StatsBomb event data comes from its official [open-data repository](https://github.com/statsbomb/open-data).

## Project structure

```text
football-player-scouting-tool/
├── frontend/                       # Next.js application
│   ├── app/                        # Dashboard UI and styling
│   └── public/
│       ├── scouting-data.json      # Precomputed profiles and model output
│       ├── shot-data/              # Lazy-loaded Understat shot files
│       └── event-lab/              # Lazy-loaded StatsBomb action files
├── scripts/                        # Data ingestion and export pipelines
├── src/                            # Reusable preprocessing and ML utilities
├── data/
│   ├── free_data/                  # Normalized free-source data and quality report
│   └── source_tests/               # Provider checks and sample responses
├── app.py                          # Legacy Streamlit reference interface
├── DATA_SOURCES.md                 # Provider research and trade-offs
├── DATA_ROADMAP.md                 # Current data status and planned upgrades
└── requirements.txt
```

## Data coverage and limitations

- Understat shot locations are attempts, not player touches.
- StatsBomb locations are recorded actions and are intentionally kept separate from current Understat player profiles because the available EPL season is 2015/16.
- The free primary dataset does not contain defensive actions, pressures, carries, progressive passes, contracts, fees, or injury history.
- API-Football enrichment remains local and experimental until field coverage and publishing rights are validated.
- Similarity indicates statistical resemblance within the selected feature space; it is not a prediction of transfer success or tactical fit.
- Role labels are interpretable percentile-based heuristics, not ground-truth positions or model predictions.

See [DATA_SOURCES.md](DATA_SOURCES.md) for provider research and [data/free_data/QUALITY_REPORT.md](data/free_data/QUALITY_REPORT.md) for the generated quality summary.

## Roadmap

- Add position-specific feature weighting and configurable recruitment priorities.
- Add age, availability, contract, and estimated-fee filters when reliable data is available.
- Expand current-season event coverage through a licensed provider.
- Add shortlist export and shareable player reports.
- Add automated data validation and model-quality tests.

## Responsible use

This is an analytical prototype for exploration and learning. Recruitment decisions should combine data with video, live scouting, medical information, personality assessment, and tactical context.
