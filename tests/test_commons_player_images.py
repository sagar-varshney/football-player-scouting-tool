from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "build_commons_player_images.py"
SPEC = importlib.util.spec_from_file_location("commons_player_images", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CommonsPlayerImageTests(unittest.TestCase):
    def test_allows_reusable_commons_licenses(self) -> None:
        for license_name in ["CC BY 4.0", "CC BY-SA 3.0", "CC0", "Public domain"]:
            with self.subTest(license_name=license_name):
                self.assertTrue(MODULE.license_allowed(license_name))

    def test_rejects_noncommercial_and_unknown_licenses(self) -> None:
        for license_name in ["CC BY-NC 4.0", "All rights reserved", "", "Fair use"]:
            with self.subTest(license_name=license_name):
                self.assertFalse(MODULE.license_allowed(license_name))

    def test_metadata_cleanup_removes_markup_and_entities(self) -> None:
        self.assertEqual(MODULE.clean_metadata("<a>Jane &amp; John</a>"), "Jane & John")

    def test_identity_key_tolerates_diacritic_and_punctuation_variants(self) -> None:
        self.assertEqual(MODULE.identity_key("Jéremy Doku"), MODULE.identity_key("Jérémy Doku"))
        self.assertEqual(MODULE.identity_key("Rayan Aït-Nouri"), "rayan ait nouri")

    def test_reviewed_identity_override_is_stable(self) -> None:
        self.assertEqual(MODULE.REVIEWED_WIKIDATA_ITEMS["Mohamed Salah"], "Q1354960")


if __name__ == "__main__":
    unittest.main()
