from __future__ import annotations

import unittest

from src.display_names import preferred_player_name


class DisplayNameTests(unittest.TestCase):
    def test_provider_override_uses_preferred_football_name(self) -> None:
        self.assertEqual(preferred_player_name("Mathis Cherki", 8094), "Rayan Cherki")

    def test_html_entities_are_decoded_for_every_player(self) -> None:
        self.assertEqual(preferred_player_name("Nico O&#039;Reilly", 11592), "Nico O'Reilly")

    def test_unknown_player_keeps_clean_provider_name(self) -> None:
        self.assertEqual(preferred_player_name("  Bukayo Saka  ", 999999), "Bukayo Saka")


if __name__ == "__main__":
    unittest.main()
