# Free Data Quality Report

Generated from free sources.

## Understat

- Seasons requested: 2021-2022, 2022-2023, 2023-2024, 2024-2025, 2025-2026
- Minimum minutes filter: 450
- Rows after filter: 1854
- Unique players: 817
- Clubs/club strings: 75
- Source role: primary real scouting-shaped player-season stats.

### Position Counts

| season | Defender | Forward | Midfielder | Winger |
| --- | --- | --- | --- | --- |
| 2021-2022 | 119 | 33 | 120 | 98 |
| 2022-2023 | 130 | 37 | 125 | 88 |
| 2023-2024 | 135 | 34 | 128 | 73 |
| 2024-2025 | 123 | 28 | 137 | 76 |
| 2025-2026 | 119 | 30 | 142 | 79 |

### Top xG / 90 Sample

| player_name | season | club | position | minutes | goals_p90 | xg_p90 | xa_p90 | shots_p90 | key_passes_p90 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Erling Haaland | 2023-2024 | Manchester City | Forward | 2581 | 0.9415 | 1.1038 | 0.1657 | 4.2542 | 1.0112 |
| Erling Haaland | 2022-2023 | Manchester City | Forward | 2803 | 1.1559 | 1.0519 | 0.1878 | 3.9493 | 0.9311 |
| Callum Wilson | 2023-2024 | Newcastle United | Forward | 963 | 0.8411 | 0.9462 | 0.0873 | 3.271 | 0.7477 |
| Callum Wilson | 2022-2023 | Newcastle United | Forward | 1911 | 0.8477 | 0.8881 | 0.168 | 3.438 | 1.1303 |
| Erling Haaland | 2025-2026 | Manchester City | Forward | 2979 | 0.8157 | 0.8699 | 0.1664 | 3.7764 | 0.7553 |
| Alexander Isak | 2023-2024 | Newcastle United | Forward | 2305 | 0.82 | 0.8619 | 0.1426 | 3.0456 | 1.0542 |
| Darwin Núñez | 2023-2024 | Liverpool | Forward | 2037 | 0.486 | 0.8478 | 0.2629 | 4.7717 | 1.458 |
| Deniz Undav | 2022-2023 | Brighton | Winger | 594 | 0.7576 | 0.8405 | 0.177 | 4.0909 | 1.2121 |
| Richarlison | 2024-2025 | Tottenham | Forward | 471 | 0.7643 | 0.8222 | 0.1575 | 3.2484 | 0.7643 |
| Eddie Nketiah | 2022-2023 | Arsenal | Forward | 1017 | 0.354 | 0.8162 | 0.1311 | 3.6283 | 0.7965 |

### Understat Null Rate

| column | null_pct |
| --- | --- |
| provider_player_id | 0.0 |
| player_name | 0.0 |
| season | 0.0 |
| competition | 0.0 |
| club | 0.0 |
| position_raw | 0.0 |
| position | 0.0 |
| matches | 0.0 |
| minutes | 0.0 |
| goals | 0.0 |
| xg | 0.0 |
| non_penalty_goals | 0.0 |
| non_penalty_xg | 0.0 |
| assists | 0.0 |
| xa | 0.0 |
| shots | 0.0 |
| key_passes | 0.0 |
| xg_chain | 0.0 |
| xg_buildup | 0.0 |
| goals_p90 | 0.0 |
| xg_p90 | 0.0 |
| assists_p90 | 0.0 |
| xa_p90 | 0.0 |
| shots_p90 | 0.0 |
| key_passes_p90 | 0.0 |
| xg_chain_p90 | 0.0 |
| xg_buildup_p90 | 0.0 |
| source_provider | 0.0 |

## FPL

- Rows: 662
- Unique players: 662
- Clubs: 20
- Source role: current Premier League metadata, availability, minutes, and fantasy-facing current stats.

### FPL Null Rate

| column | null_pct |
| --- | --- |
| fpl_player_id | 0.0 |
| opta_code | 0.0 |
| player_name | 0.0 |
| web_name | 0.0 |
| club | 0.0 |
| position | 0.0 |
| minutes | 0.0 |
| starts | 0.0 |
| goals | 0.0 |
| assists | 0.0 |
| xg | 0.0 |
| xa | 0.0 |
| xg_p90 | 0.0 |
| xa_p90 | 0.0 |
| expected_goal_involvements | 0.0 |
| expected_goal_involvements_p90 | 0.0 |
| clearances_blocks_interceptions | 0.0 |
| recoveries | 0.0 |
| tackles | 0.0 |
| defensive_contribution | 0.0 |
| influence | 0.0 |
| creativity | 0.0 |
| threat | 0.0 |
| form | 0.0 |
| selected_by_percent | 0.0 |
| now_cost | 0.0 |
| status | 0.0 |
| birth_date | 2.42 |
| news | 0.0 |
| news_added | 58.01 |
| chance_of_playing_next_round | 58.01 |
| chance_of_playing_this_round | 58.46 |
| source_provider | 0.0 |

## Verdict

Use Understat as the first replacement for generated attacking and creative metrics. Use FPL as a supplement for current squad context and availability. This is free and usable, but it is still not a complete defensive/carrying/pressure scouting dataset.

## Model validation

- Completed-season returning-player transitions: 550
- 900-minute prior error reduction versus raw per-90 rates: 10.1%
- Current-prior error gap to the best tested prior: 0.26%
- Top-10 recommendations retained across all four briefs: 57.8%
- Five-cluster silhouette score: 0.294 (moderate separation)
- Latest cluster-distribution drift: 10.9%

The full generated methodology and caveats are in [MODEL_VALIDATION.md](MODEL_VALIDATION.md).
