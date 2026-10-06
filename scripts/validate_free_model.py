"""Generate completed-season validation artifacts for the free scouting model."""

from __future__ import annotations

import os
import pathlib
import sys
import warnings

if not os.environ.get("LOKY_MAX_CPU_COUNT"):
    os.environ["LOKY_MAX_CPU_COUNT"] = "4"
warnings.filterwarnings("ignore", message="Could not find the number of physical cores.*")

import pandas as pd


ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.model_validation import build_validation, write_validation_reports


def main() -> None:
    source = ROOT / "data" / "free_data" / "understat_epl_player_seasons.csv"
    output = ROOT / "data" / "free_data" / "MODEL_VALIDATION.json"
    report = ROOT / "data" / "free_data" / "MODEL_VALIDATION.md"
    validation = build_validation(pd.read_csv(source))
    write_validation_reports(validation, output, report)
    print(f"Validated {validation['coverage']['profiles']:,} profiles; report written to {report}")


if __name__ == "__main__":
    main()
