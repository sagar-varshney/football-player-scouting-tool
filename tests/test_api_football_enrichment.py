from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "build_api_football_enrichment.py"
SPEC = importlib.util.spec_from_file_location("api_football_enrichment", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ApiFootballEnrichmentTests(unittest.TestCase):
    def test_daily_quota_stops_at_local_budget(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            quota = MODULE.DailyQuota(pathlib.Path(directory) / "ledger.json", budget=2)
            quota.consume()
            quota.consume()
            self.assertEqual(quota.remaining, 0)
            with self.assertRaises(RuntimeError):
                quota.consume()

    def test_normalization_calculates_defensive_per_90(self) -> None:
        records = [
            {
                "player": {
                    "id": 7,
                    "name": "Example Defender",
                    "age": 25,
                    "injured": False,
                },
                "statistics": [
                    {
                        "team": {"id": 10, "name": "Example FC"},
                        "league": {"id": 39, "name": "Premier League"},
                        "games": {
                            "appearences": 10,
                            "lineups": 10,
                            "minutes": 900,
                            "position": "Defender",
                            "rating": "7.10",
                        },
                        "passes": {"total": 500, "key": 10, "accuracy": "82%"},
                        "tackles": {"total": 30, "blocks": 8, "interceptions": 20},
                        "duels": {"total": 100, "won": 61},
                        "dribbles": {"attempts": 10, "success": 7},
                    }
                ],
            }
        ]

        row = MODULE.normalized_rows(records, season=2025, league_id=39)[0]

        self.assertEqual(row["season"], "2025-2026")
        self.assertEqual(row["passes_accuracy_value"], 82.0)
        self.assertEqual(row["tackles_interceptions"], 50.0)
        self.assertEqual(row["tackles_interceptions_p90"], 5.0)
        self.assertEqual(row["duels_won_p90"], 6.1)

    def test_missing_statistics_remain_missing(self) -> None:
        records = [
            {
                "player": {"id": 8, "name": "Sparse Player"},
                "statistics": [
                    {
                        "team": {"id": 11, "name": "Sparse FC"},
                        "league": {"id": 39, "name": "Premier League"},
                        "games": {"minutes": 500, "position": "Midfielder"},
                    }
                ],
            }
        ]

        row = MODULE.normalized_rows(records, season=2025, league_id=39)[0]

        self.assertIsNone(row["tackles"])
        self.assertIsNone(row["interceptions"])
        self.assertIsNone(row["tackles_interceptions_p90"])

    def test_cached_page_does_not_consume_quota(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            old_raw_dir = MODULE.RAW_DIR
            try:
                MODULE.RAW_DIR = pathlib.Path(directory) / "raw"
                cache_path = MODULE.page_cache_path(2025, 1)
                cache_path.parent.mkdir(parents=True)
                cache_path.write_text(
                    json.dumps({"paging": {"current": 1, "total": 1}, "response": []}),
                    encoding="utf-8",
                )
                quota = MODULE.DailyQuota(pathlib.Path(directory) / "ledger.json", budget=2)

                _, was_cached = MODULE.load_or_fetch_page(
                    season=2025,
                    page=1,
                    league_id=39,
                    api_key=None,
                    quota=quota,
                    cache_hours=168,
                    force=False,
                    team_id=None,
                )

                self.assertTrue(was_cached)
                self.assertEqual(quota.used, 0)
            finally:
                MODULE.RAW_DIR = old_raw_dir

    def test_page_cap_is_reported_as_omitted_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            old_raw_dir = MODULE.RAW_DIR
            try:
                MODULE.RAW_DIR = pathlib.Path(directory) / "raw"
                for page in range(1, 4):
                    cache_path = MODULE.page_cache_path(2024, page, team_id=33)
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_text(
                        json.dumps(
                            {
                                "paging": {"current": page, "total": 4},
                                "response": [{"player": {"id": page}, "statistics": []}],
                            }
                        ),
                        encoding="utf-8",
                    )
                quota = MODULE.DailyQuota(pathlib.Path(directory) / "ledger.json", budget=5)

                records, pages, cached_pages, omitted_pages = MODULE.fetch_player_scope(
                    season=2024,
                    league_id=39,
                    api_key=None,
                    quota=quota,
                    cache_hours=168,
                    force=False,
                    max_pages=3,
                    team_id=33,
                )

                self.assertEqual(len(records), 3)
                self.assertEqual(pages, 3)
                self.assertEqual(cached_pages, 3)
                self.assertEqual(omitted_pages, 1)
                self.assertEqual(quota.used, 0)
            finally:
                MODULE.RAW_DIR = old_raw_dir


if __name__ == "__main__":
    unittest.main()
