# Import your own scouting data

The frontend runs immediately with original synthetic profiles. They exercise the scouting workflow but represent no actual football players. No provider key or Python setup is needed for this mode.

To use a compatible dataset you are permitted to obtain, store and display:

```sh
cd frontend
npm run import-data -- /absolute/path/to/scouting-data.json
```

Copy `frontend/.env.example` to `frontend/.env.local`, set `SCOUTING_DATA_MODE=local`, and restart the server. Imports replace the previously imported private profile file, so keep your own source copy. The importer makes no network calls and does not verify legal permission or football accuracy.

The JSON contract has three top-level fields:

```json
{
  "metadata": {
    "features": ["goals_p90", "xg_p90", "assists_p90", "xa_p90", "shots_p90", "key_passes_p90", "xg_chain_p90", "xg_buildup_p90"],
    "source_provider": "your authorized source",
    "generated_at": "2026-10-06T00:00:00Z",
    "dataset_version": "your-version",
    "model_version": "your-model-version",
    "minimum_minutes": 450,
    "reliability_prior_minutes": 900,
    "data_note": "Describe the actual coverage and limitations."
  },
  "players": [],
  "cluster_profiles": []
}
```

Supply at least two profiles. Each profile needs a numeric `player_id`, `player_name`, `club`, `season`, `position` (Forward, Winger, Midfielder or Defender), `minutes`, `cluster` (0–4), `archetype`, and a nonnegative finite number for every selected feature. Features must be selected from the eight supported per-90 fields shown above; do not relabel incompatible provider statistics as these fields. IDs must distinguish profiles within each season/club/position. Multiple seasons for the same player are supported. Use enough players in each position/season for meaningful percentiles. The importer derives row counts and filter options from the actual profiles.

The application calculates role-relative percentiles and similarity from the imported features. Imported clusters/archetypes are supplied labels; importing does not train KMeans or establish model validity. Validation diagnostics are displayed only when supplied; do not copy past diagnostics onto a different dataset.

Imports live in ignored `frontend/.local-data/scouting-data.json`. The server's `/api/scouting` endpoint returns profiles to the browser; every displayed value is therefore accessible to the user. This is a private storage location, not an access-control mechanism or publication licence. Hosting local mode publicly requires permission for that disclosure. Demo is the default on fresh installations and CI. Never put API keys in `NEXT_PUBLIC_*` variables.

## Existing local installation

Your existing `frontend/public/scouting-data.json` is compatible with the importer. Import it locally only within the applicable source permissions. The original local assets can continue supporting portraits, shot maps and the historical event module. None of those assets are supplied with the public code release. Imported profiles alone do not add them, and missing optional maps are shown as unavailable. Real touch/action heatmaps require actual positional event observations; shot locations cannot substitute for them.

The legacy Python builders remain source code for reference and separately authorized use. They require their own inputs, dependencies and source permissions. A public clone should use demo/import mode rather than running provider collectors automatically. No verified free current-season PL provider is bundled: the existing API-Football account rejected 2026/27 on 4 October 2026. Historical local files do not become current through this import.
