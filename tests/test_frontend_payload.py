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


if __name__ == "__main__":
    unittest.main()
