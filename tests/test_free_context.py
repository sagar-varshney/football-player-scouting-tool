import csv
import datetime as dt
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
FPL_PATH = ROOT / "data" / "free_data" / "fpl_current_players.csv"


class FreeContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with FPL_PATH.open(encoding="utf-8", newline="") as handle:
            cls.rows = list(csv.DictReader(handle))

    def test_fpl_context_keeps_identity_and_availability_fields(self):
        required = {
            "fpl_player_id",
            "opta_code",
            "birth_date",
            "status",
            "news",
            "chance_of_playing_next_round",
            "chance_of_playing_this_round",
        }
        self.assertTrue(self.rows)
        self.assertTrue(required.issubset(self.rows[0]))

    def test_birth_dates_and_status_codes_are_well_formed(self):
        allowed_statuses = {"a", "d", "i", "n", "s", "u"}
        dated_rows = 0
        for row in self.rows:
            if row["birth_date"]:
                dt.date.fromisoformat(row["birth_date"])
                dated_rows += 1
            self.assertIn(row["status"], allowed_statuses)
        self.assertGreaterEqual(dated_rows / len(self.rows), 0.95)

    def test_fpl_player_ids_are_unique(self):
        player_ids = [row["fpl_player_id"] for row in self.rows]
        self.assertEqual(len(player_ids), len(set(player_ids)))


if __name__ == "__main__":
    unittest.main()
