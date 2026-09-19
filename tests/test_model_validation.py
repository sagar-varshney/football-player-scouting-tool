import json
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
VALIDATION_PATH = ROOT / "data" / "free_data" / "MODEL_VALIDATION.json"


class ModelValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.validation = json.loads(VALIDATION_PATH.read_text(encoding="utf-8"))

    def test_reliability_prior_has_completed_season_evidence(self):
        reliability = self.validation["reliability"]
        self.assertGreaterEqual(reliability["transition_pairs"], 500)
        self.assertEqual(reliability["current_prior_minutes"], 900)
        self.assertGreater(reliability["current_prior_error_reduction_pct"], 0)
        self.assertLess(reliability["current_to_best_error_gap_pct"], 1)

    def test_brief_stability_covers_every_profile(self):
        stability = self.validation["brief_stability"]
        self.assertEqual(stability["evaluated_profiles"], self.validation["coverage"]["profiles"])
        self.assertGreater(stability["all_brief_top10_retention_pct"], 0)
        self.assertLessEqual(stability["all_brief_top10_retention_pct"], 100)

    def test_cluster_diagnostics_are_bounded(self):
        clusters = self.validation["clusters"]
        self.assertEqual(clusters["cluster_count"], 5)
        self.assertGreaterEqual(clusters["silhouette_score"], -1)
        self.assertLessEqual(clusters["silhouette_score"], 1)
        self.assertGreaterEqual(clusters["latest_distribution_drift_pct"], 0)
        self.assertLessEqual(clusters["latest_distribution_drift_pct"], 100)


if __name__ == "__main__":
    unittest.main()
