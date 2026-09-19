import json
import math
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PAYLOAD_PATH = ROOT / "frontend" / "public" / "scouting-data.json"


class FrontendPayloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = json.loads(PAYLOAD_PATH.read_text(encoding="utf-8"))
        cls.metadata = cls.payload["metadata"]
        cls.players = cls.payload["players"]

    def test_metadata_records_dataset_and_model_versions(self):
        self.assertRegex(self.metadata["dataset_version"], r"^epl-[0-9a-f]{10}$")
        self.assertRegex(self.metadata["model_version"], r"^understat-profile-v\d+\.\d+$")
        self.assertEqual(self.metadata["reliability_prior_minutes"], 900)
        self.assertEqual(self.metadata["minimum_minutes"], 450)

    def test_metadata_row_count_matches_payload(self):
        self.assertEqual(self.metadata["row_count"], len(self.players))
        self.assertGreater(len(self.players), 1_000)

    def test_player_season_identity_is_unique(self):
        identities = [
            (player["provider_player_id"], player["club"], player["position"], player["season"])
            for player in self.players
        ]
        self.assertEqual(len(identities), len(set(identities)))

    def test_model_features_are_finite_for_every_player(self):
        for player in self.players:
            for feature in self.metadata["features"]:
                self.assertTrue(math.isfinite(float(player[feature])), f"{player['player_name']} has invalid {feature}")

    def test_current_context_is_versioned_and_conservative(self):
        self.assertRegex(self.metadata["context_version"], r"^fpl-[0-9a-f]{10}$")
        self.assertGreaterEqual(self.metadata["current_context_players"], 250)
        latest_season = max(player["season"] for player in self.players)
        latest = [player for player in self.players if player["season"] == latest_season]
        matched = [player for player in latest if player.get("current_status")]
        self.assertEqual(len(matched), self.metadata["current_context_players"])
        self.assertTrue(all(15 <= player["current_age"] <= 45 for player in matched))
        fpl_ids = [player["current_fpl_player_id"] for player in matched]
        self.assertEqual(len(fpl_ids), len(set(fpl_ids)))
        self.assertTrue(all(player["current_context_match"] in {"exact name", "club + unique football name"} for player in matched))

    def test_display_name_override_never_renames_rodri(self):
        rodri_rows = [player for player in self.players if player["provider_player_id"] == 2496]
        self.assertTrue(rodri_rows)
        self.assertEqual({player["player_name"] for player in rodri_rows}, {"Rodri"})

    def test_role_labels_are_position_specific(self):
        allowed = {
            "Forward": {"Complete Forward", "Penalty Box Finisher", "Link Forward", "Connecting Forward", "Shot-Focused Forward", "Balanced Forward"},
            "Winger": {"Goal-Creating Winger", "Inside Forward", "Wide Playmaker", "Chance-Creating Winger", "Combination Winger", "Wide Outlet"},
            "Midfielder": {"Goal-Creating Midfielder", "Advanced Playmaker", "Possession Controller", "Buildup Connector", "Possession Hub", "Support Midfielder"},
            "Defender": {"Attacking Defender", "Possession Defender", "Buildup Defender", "Low-Usage Defender"},
        }
        for player in self.players:
            self.assertIn(player["archetype"], allowed[player["position"]])

    def test_completed_season_validation_is_embedded(self):
        validation = self.metadata["validation"]
        self.assertGreaterEqual(validation["reliability"]["transition_pairs"], 500)
        self.assertGreater(validation["reliability"]["current_prior_error_reduction_pct"], 0)
        self.assertEqual(validation["brief_stability"]["evaluated_profiles"], len(self.players))
        self.assertEqual(validation["clusters"]["cluster_count"], 5)
        self.assertGreaterEqual(validation["clusters"]["silhouette_score"], -1)
        self.assertLessEqual(validation["clusters"]["silhouette_score"], 1)


if __name__ == "__main__":
    unittest.main()
