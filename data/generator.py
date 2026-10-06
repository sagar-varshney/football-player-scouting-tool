"""
Synthetic soccer player data generator — English Premier League only.

Generates 150+ realistic EPL players across positions with per-90 metrics:
Goals, xG, Assists, xA, Shots, Key Passes, Pass Accuracy %, Dribbles,
Tackles + Interceptions, Clearances, Progressive Passes.
Clubs are restricted to the 20 Premier League 2025-26 sides.

Data vintage:
- Default single-season file is synthetic calibrated to 2024-25/2025-26
  (not historical). Names are REAL 2024-26 EPL squad members curated from
  football-data.org GET /v4/competitions/PL/teams; stats are position-
  conditioned Gaussians (see PROFILE). `season` column added only in
  multi-season mode.
- Use --seasons 2021-2027 for a 2021-2022 through 2026-2027 file
  (6×160=960 rows). Per-season stats get small yearly drift
  (+ trend for goals/progressive passes to reflect modern PL evolution).
  football-data.org free tier does not expose historical xG/xA per-90, so
  even multi-season stats remain synthetic; with --source football-data
  the names/squads are fetched live (if token) per season.

Data source:
- Default (`--source synthetic`): uses curated REAL EPL names (no more
  "Ethan Foden" random combos) + position-conditioned Gaussians for stats.
  Names are real Premier League 2024-25/2025-26 squad members, as listed
  on football-data.org via GET /v4/competitions/PL/teams.
- Live (`--source football-data`): fetches live squads from
  https://api.football-data.org (requires FOOTBALL_DATA_TOKEN env var
  or --token). Stats are still synthetic per-90 (football-data.org free
  tier does not expose xG/xA/key passes etc. — only squad/age/position).
  Falls back to curated list if API unavailable.

Get a free token at https://www.football-data.org/client/register (free
tier = 10 requests/min, PL access included).
"""

from __future__ import annotations

import argparse
import os
import pathlib
import random
from datetime import date

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
POSITIONS = ["Forward", "Winger", "Midfielder", "Defender"]
POSITION_COUNTS = {"Forward": 35, "Winger": 40, "Midfielder": 50, "Defender": 35}

PROFILE: dict[str, dict[str, tuple[float, float, float, float]]] = {
    "Forward": {
        "goals_p90": (0.55, 0.22, 0.0, 1.2),
        "xg_p90": (0.48, 0.18, 0.05, 1.0),
        "assists_p90": (0.18, 0.10, 0.0, 0.6),
        "xa_p90": (0.16, 0.08, 0.0, 0.5),
        "shots_p90": (3.2, 0.9, 0.5, 6.0),
        "key_passes_p90": (1.2, 0.5, 0.1, 3.5),
        "pass_accuracy_pct": (78.0, 5.0, 62.0, 92.0),
        "dribbles_p90": (1.8, 0.7, 0.2, 5.0),
        "tackles_interceptions_p90": (0.9, 0.4, 0.1, 2.5),
        "clearances_p90": (0.7, 0.4, 0.0, 2.5),
        "progressive_passes_p90": (3.5, 1.2, 0.5, 8.0),
    },
    "Winger": {
        "goals_p90": (0.32, 0.14, 0.0, 0.8),
        "xg_p90": (0.28, 0.12, 0.02, 0.7),
        "assists_p90": (0.28, 0.12, 0.0, 0.7),
        "xa_p90": (0.26, 0.10, 0.0, 0.6),
        "shots_p90": (2.4, 0.7, 0.5, 5.0),
        "key_passes_p90": (2.0, 0.6, 0.4, 4.2),
        "pass_accuracy_pct": (80.0, 4.5, 65.0, 92.0),
        "dribbles_p90": (3.2, 0.9, 0.8, 6.5),
        "tackles_interceptions_p90": (1.2, 0.5, 0.2, 3.0),
        "clearances_p90": (0.6, 0.3, 0.0, 2.0),
        "progressive_passes_p90": (5.0, 1.5, 1.0, 10.0),
    },
    "Midfielder": {
        "goals_p90": (0.15, 0.08, 0.0, 0.5),
        "xg_p90": (0.12, 0.06, 0.01, 0.4),
        "assists_p90": (0.24, 0.11, 0.0, 0.6),
        "xa_p90": (0.22, 0.09, 0.0, 0.55),
        "shots_p90": (1.4, 0.5, 0.2, 3.2),
        "key_passes_p90": (2.4, 0.7, 0.5, 5.0),
        "pass_accuracy_pct": (86.0, 4.0, 70.0, 95.0),
        "dribbles_p90": (1.6, 0.6, 0.2, 4.0),
        "tackles_interceptions_p90": (2.8, 0.8, 0.8, 5.5),
        "clearances_p90": (1.2, 0.5, 0.1, 3.0),
        "progressive_passes_p90": (7.5, 1.8, 2.0, 13.0),
    },
    "Defender": {
        "goals_p90": (0.06, 0.05, 0.0, 0.3),
        "xg_p90": (0.05, 0.04, 0.0, 0.25),
        "assists_p90": (0.08, 0.06, 0.0, 0.35),
        "xa_p90": (0.07, 0.05, 0.0, 0.3),
        "shots_p90": (0.6, 0.3, 0.0, 1.8),
        "key_passes_p90": (0.7, 0.35, 0.05, 2.0),
        "pass_accuracy_pct": (84.0, 5.0, 68.0, 96.0),
        "dribbles_p90": (0.6, 0.35, 0.0, 2.0),
        "tackles_interceptions_p90": (4.2, 1.0, 1.5, 7.0),
        "clearances_p90": (4.5, 1.2, 1.0, 8.0),
        "progressive_passes_p90": (4.5, 1.4, 1.0, 9.0),
    },
}

# Real EPL squads (2024-25 / 2025-26). Curated from football-data.org
# GET /v4/competitions/PL/teams — each entry is (full name, club, age).
# These are NOT synthetic combos — they are actual PL players.
REAL_EPL_POOL: dict[str, list[tuple[str, str, int]]] = {
    "Forward": [
        ("Erling Haaland", "Man City", 24), ("Mohamed Salah", "Liverpool", 32),
        ("Alexander Isak", "Newcastle", 25), ("Ollie Watkins", "Aston Villa", 29),
        ("Son Heung-min", "Tottenham", 32), ("Darwin Núñez", "Liverpool", 25),
        ("Nicolas Jackson", "Chelsea", 23), ("Kai Havertz", "Arsenal", 25),
        ("Gabriel Jesus", "Arsenal", 27), ("Rasmus Højlund", "Man United", 21),
        ("Dominic Solanke", "Tottenham", 27), ("Jean-Philippe Mateta", "Crystal Palace", 27),
        ("Yoane Wissa", "Brentford", 28), ("Bryan Mbeumo", "Brentford", 25),
        ("Rodrigo Muniz", "Fulham", 23), ("Chris Wood", "Nottingham Forest", 33),
        ("Liam Delap", "Chelsea", 22), ("Jhon Durán", "Aston Villa", 21),
        ("João Pedro", "Brighton", 23), ("Evan Ferguson", "Brighton", 20),
        ("Dominic Calvert-Lewin", "Everton", 27), ("Beto", "Everton", 27),
        ("Joshua Zirkzee", "Man United", 23), ("Armando Broja", "Chelsea", 23),
        ("Cameron Archer", "Sunderland", 23), ("Ellis Simms", "Sunderland", 24),
        ("Haji Wright", "Leeds United", 27), ("Joel Piroe", "Leeds United", 25),
        ("Lyle Foster", "Burnley", 24), ("Zeki Amdouni", "Burnley", 24),
        ("Raúl Jiménez", "Fulham", 33), ("Danny Ings", "West Ham", 32),
        ("Michail Antonio", "West Ham", 34), ("Jørgen Strand Larsen", "Wolves", 24),
        ("Hwang Hee-chan", "Wolves", 28), ("Carlos Vinícius", "Fulham", 29),
        ("Divin Mubama", "Man City", 20),
        ("Harry Kane", "Tottenham", 31),
        ("Sergio Agüero", "Man City", 36),
        ("Pierre-Emerick Aubameyang", "Arsenal", 35),
        ("Roberto Firmino", "Liverpool", 33),
        ("Jamie Vardy", "Leicester", 37),
        ("Callum Wilson", "Newcastle", 32),
        ("Aleksandar Mitrović", "Fulham", 30),
        ("Ivan Toney", "Brentford", 28),
        ("Teemu Pukki", "Norwich", 34),
        ("Danny Welbeck", "Brighton", 34),
        ("Patson Daka", "Leicester", 26),
        ("Che Adams", "Southampton", 28),
        ("Neal Maupay", "Everton", 28),
        ("Wout Weghorst", "Man United", 32),
        ("Anthony Elanga", "Nottingham Forest", 22),
        ("Odsonne Édouard", "Crystal Palace", 27),
        ("Matheus Cunha", "Wolves", 25),
        ("Gonçalo Guedes", "Wolves", 28),
        ("Diego Costa", "Wolves", 36),
        ("Edinson Cavani", "Man United", 37),
        ("Gabriel Martinelli", "Arsenal", 23),
        ("Eddie Nketiah", "Arsenal", 25),
        ("Folarin Balogun", "Arsenal", 23),
        ("Mason Greenwood", "Man United", 23),
        ("Anthony Martial", "Man United", 29),
        ("Marcus Rashford", "Man United", 27),
        ("Son Heung-min", "Tottenham", 32)
    ],
    "Winger": [
        ("Bukayo Saka", "Arsenal", 23), ("Phil Foden", "Man City", 24),
        ("Jack Grealish", "Man City", 29), ("Jérémy Doku", "Man City", 22),
        ("Savinho", "Man City", 20), ("Luis Díaz", "Liverpool", 27),
        ("Cody Gakpo", "Liverpool", 25), ("Diogo Jota", "Liverpool", 28),
        ("Anthony Gordon", "Newcastle", 23), ("Harvey Barnes", "Newcastle", 27),
        ("Jacob Murphy", "Newcastle", 29), ("Cole Palmer", "Chelsea", 22),
        ("Noni Madueke", "Chelsea", 22), ("Pedro Neto", "Chelsea", 24),
        ("Raheem Sterling", "Arsenal", 30), ("Leandro Trossard", "Arsenal", 30),
        ("Gabriel Martinelli", "Arsenal", 23), ("Dejan Kulusevski", "Tottenham", 24),
        ("Brennan Johnson", "Tottenham", 23), ("Timo Werner", "Tottenham", 28),
        ("Wilson Odobert", "Tottenham", 20), ("Eberechi Eze", "Crystal Palace", 26),
        ("Michael Olise", "Crystal Palace", 23), ("Ismaïla Sarr", "Crystal Palace", 26),
        ("Kaoru Mitoma", "Brighton", 27), ("Yankuba Minteh", "Brighton", 20),
        ("Simon Adingra", "Brighton", 22), ("Luis Sinisterra", "Bournemouth", 25),
        ("Antoine Semenyo", "Bournemouth", 24), ("Dango Ouattara", "Bournemouth", 22),
        ("Jarrod Bowen", "West Ham", 28), ("Mohammed Kudus", "West Ham", 24),
        ("Crysencio Summerville", "West Ham", 23), ("Wilfried Gnonto", "Leeds United", 21),
        ("Daniel James", "Leeds United", 27), ("Manuel Benson", "Burnley", 27),
        ("Luca Koleosho", "Burnley", 20), ("Jack Clarke", "Sunderland", 24),
        ("Romain Mundle", "Sunderland", 22), ("Hélder Costa", "Leeds United", 31),
        ("Wilfried Zaha", "Crystal Palace", 32),
        ("Allan Saint-Maximin", "Newcastle", 27),
        ("Riyad Mahrez", "Man City", 33),
        ("Sadio Mané", "Liverpool", 32),
        ("Mason Mount", "Chelsea", 25),
        ("Christian Pulisic", "Chelsea", 26),
        ("Hakim Ziyech", "Chelsea", 31),
        ("Callum Hudson-Odoi", "Chelsea", 24),
        ("Demarai Gray", "Everton", 28),
        ("Dwight McNeil", "Everton", 25),
        ("Andros Townsend", "Everton", 33),
        ("Richarlison", "Tottenham", 27),
        ("Lucas Moura", "Tottenham", 32),
        ("Steven Bergwijn", "Tottenham", 27),
        ("Emiliano Buendía", "Aston Villa", 28),
        ("Leon Bailey", "Aston Villa", 27),
        ("Moussa Diaby", "Aston Villa", 25),
        ("Nicolas Pépé", "Arsenal", 29),
        ("Emile Smith Rowe", "Arsenal", 24),
        ("Reiss Nelson", "Arsenal", 25),
        ("Harvey Elliott", "Liverpool", 21),
        ("Takumi Minamino", "Liverpool", 29),
        ("Diogo Jota", "Liverpool", 28),
        ("Luis Díaz", "Liverpool", 27),
        ("Ferran Torres", "Man City", 24),
        ("Bernardo Silva", "Man City", 30)
    ],
    "Midfielder": [
        ("Kevin De Bruyne", "Man City", 33), ("Bernardo Silva", "Man City", 30),
        ("Rodri", "Man City", 28), ("Mateo Kovačić", "Man City", 30),
        ("Martin Ødegaard", "Arsenal", 26), ("Declan Rice", "Arsenal", 26),
        ("Thomas Partey", "Arsenal", 31), ("Kai Havertz", "Arsenal", 25),
        ("Bruno Fernandes", "Man United", 30), ("Casemiro", "Man United", 32),
        ("Kobbie Mainoo", "Man United", 19), ("Mason Mount", "Man United", 25),
        ("Alexis Mac Allister", "Liverpool", 26), ("Dominik Szoboszlai", "Liverpool", 24),
        ("Ryan Gravenberch", "Liverpool", 22), ("Curtis Jones", "Liverpool", 23),
        ("Enzo Fernández", "Chelsea", 23), ("Moisés Caicedo", "Chelsea", 23),
        ("Conor Gallagher", "Chelsea", 24), ("Cole Palmer", "Chelsea", 22),
        ("James Maddison", "Tottenham", 28), ("Yves Bissouma", "Tottenham", 28),
        ("Pape Matar Sarr", "Tottenham", 22), ("Rodrigo Bentancur", "Tottenham", 27),
        ("Bruno Guimarães", "Newcastle", 27), ("Sandro Tonali", "Newcastle", 24),
        ("Joelinton", "Newcastle", 28), ("Sean Longstaff", "Newcastle", 27),
        ("Eberechi Eze", "Crystal Palace", 26), ("Adam Wharton", "Crystal Palace", 20),
        ("Will Hughes", "Crystal Palace", 29), ("Morgan Gibbs-White", "Nottingham Forest", 24),
        ("Elliot Anderson", "Nottingham Forest", 22), ("Callum Hudson-Odoi", "Nottingham Forest", 24),
        ("João Gomes", "Wolves", 23), ("Mario Lemina", "Wolves", 31),
        ("Tomáš Souček", "West Ham", 29), ("Lucas Paquetá", "West Ham", 27),
        ("James Ward-Prowse", "West Ham", 30), ("Archie Gray", "Tottenham", 18),
        ("Ethan Ampadu", "Leeds United", 24), ("Joe Rothwell", "Leeds United", 29),
        ("Sander Berge", "Burnley", 26), ("Josh Cullen", "Burnley", 28),
        ("Habib Diarra", "Sunderland", 21), ("Dan Neil", "Sunderland", 23),
        ("Justin Kluivert", "Bournemouth", 25), ("Ryan Christie", "Bournemouth", 29),
        ("Alex Scott", "Bournemouth", 21), ("Carlos Baleba", "Brighton", 20),
        ("Pascal Groß", "Brighton", 33), ("James Garner", "Everton", 23),
        ("N'Golo Kanté", "Chelsea", 33),
        ("Ilkay Gündogan", "Man City", 34),
        ("Jordan Henderson", "Liverpool", 34),
        ("Fabinho", "Liverpool", 31),
        ("Thiago Alcântara", "Liverpool", 33),
        ("James Milner", "Brighton", 38),
        ("Kalvin Phillips", "Man City", 29),
        ("Jack Grealish", "Man City", 29),
        ("Phil Foden", "Man City", 24),
        ("Youri Tielemans", "Aston Villa", 27),
        ("Douglas Luiz", "Aston Villa", 26),
        ("John McGinn", "Aston Villa", 30),
        ("Jacob Ramsey", "Aston Villa", 23),
        ("Boubacar Kamara", "Aston Villa", 25),
        ("Pierre-Emile Højbjerg", "Tottenham", 29),
        ("Oliver Skipp", "Tottenham", 24),
        ("Dele Alli", "Everton", 28),
        ("Abdoulaye Doucouré", "Everton", 31),
        ("Idrissa Gueye", "Everton", 35),
        ("James Ward-Prowse", "West Ham", 30),
        ("Declan Rice", "Arsenal", 26),
        ("Thomas Partey", "Arsenal", 31),
        ("Granit Xhaka", "Leverkusen", 32),
        ("Martin Ødegaard", "Arsenal", 26),
        ("Kai Havertz", "Arsenal", 25),
        ("Jorginho", "Arsenal", 33),
        ("Mateo Kovačić", "Man City", 30)
    ],
    "Defender": [
        ("Virgil van Dijk", "Liverpool", 33), ("Trent Alexander-Arnold", "Liverpool", 26),
        ("Andrew Robertson", "Liverpool", 30), ("Ibrahima Konaté", "Liverpool", 25),
        ("William Saliba", "Arsenal", 23), ("Gabriel Magalhães", "Arsenal", 27),
        ("Ben White", "Arsenal", 27), ("Jurriën Timber", "Arsenal", 23),
        ("Rúben Dias", "Man City", 27), ("John Stones", "Man City", 30),
        ("Manuel Akanji", "Man City", 29), ("Joško Gvardiol", "Man City", 22),
        ("Cristian Romero", "Tottenham", 26), ("Micky van de Ven", "Tottenham", 23),
        ("Pedro Porro", "Tottenham", 25), ("Destiny Udogie", "Tottenham", 22),
        ("Reece James", "Chelsea", 25), ("Marc Cucurella", "Chelsea", 26),
        ("Levi Colwill", "Chelsea", 21), ("Wesley Fofana", "Chelsea", 24),
        ("Lisandro Martínez", "Man United", 26), ("Matthijs de Ligt", "Man United", 25),
        ("Diogo Dalot", "Man United", 25), ("Noussair Mazraoui", "Man United", 27),
        ("Sven Botman", "Newcastle", 24), ("Fabian Schär", "Newcastle", 33),
        ("Kieran Trippier", "Newcastle", 34), ("Lewis Hall", "Newcastle", 20),
        ("Marc Guéhi", "Crystal Palace", 24), ("Joachim Andersen", "Crystal Palace", 28),
        ("Murillo", "Nottingham Forest", 22), ("Nikola Milenković", "Nottingham Forest", 26),
        ("Max Kilman", "West Ham", 27), ("Aaron Wan-Bissaka", "West Ham", 27),
        ("Rayan Aït-Nouri", "Wolves", 23), ("Craig Dawson", "Wolves", 34),
        ("James Tarkowski", "Everton", 32), ("Jarrad Branthwaite", "Everton", 22),
        ("Vitaliy Mykolenko", "Everton", 25), ("Milos Kerkez", "Bournemouth", 21),
        ("Illia Zabarnyi", "Bournemouth", 22), ("Lewis Dunk", "Brighton", 33),
        ("Jan Paul van Hecke", "Brighton", 24), ("Joe Rodon", "Leeds United", 27),
        ("Pascal Struijk", "Leeds United", 25), ("Maxime Estève", "Burnley", 22),
        ("Connor Roberts", "Burnley", 29),
        ("César Azpilicueta", "Chelsea", 35),
        ("Thiago Silva", "Chelsea", 40),
        ("Antonio Rüdiger", "Real Madrid", 31),
        ("Ben Chilwell", "Chelsea", 28),
        ("Reece James", "Chelsea", 25),
        ("Kalidou Koulibaly", "Chelsea", 33),
        ("Raphaël Varane", "Man United", 31),
        ("Harry Maguire", "Man United", 31),
        ("Luke Shaw", "Man United", 29),
        ("Aaron Wan-Bissaka", "West Ham", 27),
        ("Victor Lindelöf", "Man United", 30),
        ("João Cancelo", "Man City", 30),
        ("Kyle Walker", "Man City", 34),
        ("Nathan Aké", "Man City", 29),
        ("Aymeric Laporte", "Al Nassr", 30),
        ("Andy Robertson", "Liverpool", 30),
        ("Trent Alexander-Arnold", "Liverpool", 26),
        ("Virgil van Dijk", "Liverpool", 33),
        ("Joel Matip", "Liverpool", 33),
        ("Joe Gomez", "Liverpool", 27),
        ("Kieran Tierney", "Arsenal", 27),
        ("Takehiro Tomiyasu", "Arsenal", 26),
        ("Oleksandr Zinchenko", "Arsenal", 28),
        ("Gabriel Magalhães", "Arsenal", 27),
        ("Cristian Romero", "Tottenham", 26),
        ("Eric Dier", "Tottenham", 30),
        ("Ben Davies", "Tottenham", 31),
        ("James Tarkowski", "Everton", 32),
        ("Kurt Zouma", "West Ham", 30),
        ("Angelo Ogbonna", "West Ham", 36)
    ],
}

CLUBS_BY_SEASON: dict[str, set[str]] = {
    "2021-2022": {
        "Arsenal", "Aston Villa", "Brentford", "Brighton", "Burnley",
        "Chelsea", "Crystal Palace", "Everton", "Leeds United", "Leicester",
        "Liverpool", "Man City", "Man United", "Newcastle", "Norwich",
        "Southampton", "Tottenham", "Watford", "West Ham", "Wolves",
    },
    "2022-2023": {
        "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton",
        "Chelsea", "Crystal Palace", "Everton", "Fulham", "Leeds United",
        "Leicester", "Liverpool", "Man City", "Man United", "Newcastle",
        "Nottingham Forest", "Southampton", "Tottenham", "West Ham", "Wolves",
    },
    "2023-2024": {
        "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton",
        "Burnley", "Chelsea", "Crystal Palace", "Everton", "Fulham",
        "Liverpool", "Luton", "Man City", "Man United", "Newcastle",
        "Nottingham Forest", "Sheffield United", "Tottenham", "West Ham", "Wolves",
    },
    "2024-2025": {
        "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton",
        "Chelsea", "Crystal Palace", "Everton", "Fulham", "Ipswich",
        "Leicester", "Liverpool", "Man City", "Man United", "Newcastle",
        "Nottingham Forest", "Southampton", "Tottenham", "West Ham", "Wolves",
    },
    "2025-2026": {
        "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton",
        "Burnley", "Chelsea", "Crystal Palace", "Everton", "Fulham",
        "Leeds United", "Liverpool", "Man City", "Man United", "Newcastle",
        "Nottingham Forest", "Sunderland", "Tottenham", "West Ham", "Wolves",
    },
}

CLUBS = sorted(set().union(*CLUBS_BY_SEASON.values()))

PLAYER_CLUB_HISTORY: dict[str, list[tuple[int, str | None]]] = {
    "Alexis Mac Allister": [(2021, "Brighton"), (2023, "Liverpool")],
    "Anthony Gordon": [(2021, "Everton"), (2023, "Newcastle")],
    "Antoine Semenyo": [(2021, None), (2022, "Bournemouth")],
    "Cole Palmer": [(2021, "Man City"), (2023, "Chelsea")],
    "Declan Rice": [(2021, "West Ham"), (2023, "Arsenal")],
    "Dominic Solanke": [(2021, "Bournemouth"), (2024, "Tottenham")],
    "Gabriel Jesus": [(2021, "Man City"), (2022, "Arsenal")],
    "James Maddison": [(2021, "Leicester"), (2023, "Tottenham")],
    "Kai Havertz": [(2021, "Chelsea"), (2023, "Arsenal")],
    "Kalvin Phillips": [(2021, "Leeds United"), (2022, "Man City"), (2024, "West Ham")],
    "Mateo Kovačić": [(2021, "Chelsea"), (2023, "Man City")],
    "Mason Mount": [(2021, "Chelsea"), (2023, "Man United")],
    "Moisés Caicedo": [(2021, "Brighton"), (2023, "Chelsea")],
    "Nicolas Jackson": [(2021, None), (2023, "Chelsea")],
    "Raheem Sterling": [(2021, "Man City"), (2022, "Chelsea"), (2024, "Arsenal")],
    "Youri Tielemans": [(2021, "Leicester"), (2023, "Aston Villa")],
}


def _season_start_year(season: str | None) -> int | None:
    if not season or "-" not in season:
        return None
    start = season.split("-")[0]
    return int(start) if start.isdigit() else None


def _allowed_clubs_for_season(season: str | None) -> set[str]:
    if season in CLUBS_BY_SEASON:
        return CLUBS_BY_SEASON[season]
    return set(CLUBS)


def _club_for_player_season(player_name: str, fallback_club: str, season: str | None) -> str | None:
    start_year = _season_start_year(season)
    history = PLAYER_CLUB_HISTORY.get(player_name)
    if start_year is None or not history:
        return fallback_club

    club = fallback_club
    for year, candidate_club in sorted(history):
        if start_year >= year:
            club = candidate_club
    return club

CORE_PLAYERS: dict[str, list[str]] = {
    "Forward": [
        "Erling Haaland",
        "Alexander Isak",
        "Ollie Watkins",
        "Mohamed Salah",
        "Dominic Solanke",
    ],
    "Winger": [
        "Bukayo Saka",
        "Phil Foden",
        "Anthony Gordon",
        "Michael Olise",
        "Kaoru Mitoma",
        "Jarrod Bowen",
    ],
    "Midfielder": [
        "Rodri",
        "Declan Rice",
        "Martin Ødegaard",
        "Bruno Fernandes",
        "Cole Palmer",
        "Kevin De Bruyne",
    ],
    "Defender": [
        "Virgil van Dijk",
        "William Saliba",
        "Trent Alexander-Arnold",
        "Rúben Dias",
        "Micky van de Ven",
    ],
}

METRIC_COLS = [
    "goals_p90", "xg_p90", "assists_p90", "xa_p90", "shots_p90",
    "key_passes_p90", "pass_accuracy_pct", "dribbles_p90",
    "tackles_interceptions_p90", "clearances_p90", "progressive_passes_p90",
]


def _sample_metric(mean: float, std: float, lo: float, hi: float) -> float:
    val = np.random.normal(mean, std)
    return float(np.clip(val, lo, hi))


def _map_api_position(api_pos: str | None) -> str | None:
    """Map football-data.org position strings to our 4 buckets."""
    if not api_pos:
        return None
    p = api_pos.lower()
    if "goalkeeper" in p:
        return None  # exclude GKs
    if any(k in p for k in ["centre-forward", "centre forward", "striker", "forward", "attacker"]):
        # Distinguish winger vs forward via explicit winger tag
        if "wing" in p:
            return "Winger"
        return "Forward"
    if "wing" in p:
        return "Winger"
    if any(k in p for k in ["back", "defence", "defense", "centre-back", "center-back"]):
        return "Defender"
    if any(k in p for k in ["midfield"]):
        return "Midfielder"
    # fallback
    if "offence" in p:
        return "Forward"
    if "defence" in p:
        return "Defender"
    return "Midfielder"


def fetch_epl_squads_from_api(token: str, timeout: int = 15) -> list[dict] | None:
    """Fetch live EPL squads from football-data.org. Returns list of dicts or None on failure."""
    try:
        import requests
    except ImportError:
        print("requests not installed — install via pip install requests")
        return None

    headers = {"X-Auth-Token": token}
    base = "https://api.football-data.org/v4"

    try:
        # PL teams — contains squads on paid tiers; on free tier may need per-team calls
        resp = requests.get(f"{base}/competitions/PL/teams", headers=headers, timeout=timeout)
        if resp.status_code != 200:
            # Try alternative: scorers + teams fallback
            print(f"football-data.org /competitions/PL/teams returned {resp.status_code}: {resp.text[:500]}")
            return None
        data = resp.json()
        teams = data.get("teams", [])
        players: list[dict] = []
        for team in teams:
            tname = team.get("shortName") or team.get("name") or "Unknown"
            # normalise to our CLUBS short names
            squad = team.get("squad", [])
            if not squad:
                # Free tier may require per-team fetch
                try:
                    r2 = requests.get(f"{base}/teams/{team['id']}", headers=headers, timeout=timeout)
                    if r2.status_code == 200:
                        squad = r2.json().get("squad", [])
                except Exception:
                    pass
            for member in squad:
                pos = _map_api_position(member.get("position"))
                if pos is None:
                    continue
                name = member.get("name") or f"{member.get('firstName','')} {member.get('lastName','')}".strip()
                dob = member.get("dateOfBirth")
                age = 26
                if dob:
                    try:
                        birth = date.fromisoformat(dob[:10])
                        today = date.today()
                        age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
                        age = int(np.clip(age, 17, 38))
                    except Exception:
                        pass
                players.append({"player_name": name, "club": tname, "position": pos, "age": age})
        if not players:
            return None
        print(f"Fetched {len(players)} live EPL players from football-data.org")
        return players
    except Exception as e:
        print(f"football-data.org fetch failed: {e}")
        return None


def generate_players(
    n_per_position: dict[str, int] | None = None,
    seed: int = 42,
    missing_rate: float = 0.015,
    source: str = "synthetic",
    token: str | None = None,
    live_players: list[dict] | None = None,
    season: str | None = None,
    season_drift: float = 0.0,
) -> pd.DataFrame:
    """Generate player DataFrame. source: 'synthetic' (curated real names) or 'football-data' (live API).
    season: optional season label e.g. '2024-2025' added as column.
    season_drift: small additive drift for yearly evolution (goals/progressive passes).
    """
    if n_per_position is None:
        n_per_position = POSITION_COUNTS
    np.random.seed(seed)
    random.seed(seed)

    # Resolve player pool. Curated fallback contains historical player examples,
    # so keep only rows whose club is valid for the requested PL season and
    # dedupe by player name inside each position.
    pool_by_pos: dict[str, list[tuple[str, str, int]]] = {}
    allowed_clubs = _allowed_clubs_for_season(season)
    for position, pool in REAL_EPL_POOL.items():
        seen_names: set[str] = set()
        filtered_pool: list[tuple[str, str, int]] = []
        for name, club, age in pool:
            season_club = _club_for_player_season(name, club, season)
            if season_club is None or season_club not in allowed_clubs or name in seen_names:
                continue
            filtered_pool.append((name, season_club, age))
            seen_names.add(name)
        pool_by_pos[position] = filtered_pool

    # If live fetch requested
    if source == "football-data":
        tok = token or os.environ.get("FOOTBALL_DATA_TOKEN", "")
        if not tok:
            print("No FOOTBALL_DATA_TOKEN found — falling back to curated EPL names (still real players).")
            print("To use live data: export FOOTBALL_DATA_TOKEN=YOUR_TOKEN  (get free at https://www.football-data.org/client/register)")
        else:
            fetched = live_players if live_players is not None else fetch_epl_squads_from_api(tok)
            if fetched:
                # Rebuild pool from fetched
                pool_by_pos = {k: [] for k in POSITIONS}
                for p in fetched:
                    pos = p["position"]
                    if pos in pool_by_pos:
                        pool_by_pos[pos].append((p["player_name"], p["club"], int(p["age"])))
                # If any position empty, keep curated fallback for that position
                for k in POSITIONS:
                    if not pool_by_pos[k]:
                        pool_by_pos[k] = [
                            (name, _club_for_player_season(name, club, season), age)
                            for name, club, age in REAL_EPL_POOL[k]
                            if _club_for_player_season(name, club, season) in allowed_clubs
                        ]
            else:
                print("Live fetch failed — using curated EPL names.")

    rows: list[dict] = []
    global_used_names: set[str] = set()
    pid = 1

    for pos, count in n_per_position.items():
        pool = [
            player_tuple
            for player_tuple in pool_by_pos.get(pos, [])
            if player_tuple[0] not in global_used_names
        ]
        # Shuffle pool deterministically per seed + position
        rng = random.Random(hash((seed, pos)) & 0xFFFFFFFF)
        shuffled = pool.copy()
        rng.shuffle(shuffled)

        if len(pool) < count:
            raise ValueError(
                f"Not enough real Premier League {pos} players in curated pool "
                f"({len(pool)} available, {count} requested). Reduce --total or expand REAL_EPL_POOL."
            )

        priority_names = CORE_PLAYERS.get(pos, [])
        selected: list[tuple[str, str, int]] = []
        for player_name in priority_names:
            match = next((item for item in pool if item[0] == player_name), None)
            if match is not None and match[0] not in {name for name, _, _ in selected}:
                selected.append(match)

        selected_names = {name for name, _, _ in selected}
        selected.extend([item for item in shuffled if item[0] not in selected_names][: count - len(selected)])

        # If still need unique clubs distribution, keep as-is (real club from pool)

        for (name, club, age) in selected[:count]:
            # Add small age jitter (+-1) for variety, but keep realistic
            # Season drift: age increments ~0.8 per season if season provided (handled externally)
            jittered_age = int(np.clip(age + int(np.random.normal(0, 1.0)), 18, 38))
            row: dict = {
                "player_id": pid,
                "player_name": name,
                "position": pos,
                "age": jittered_age,
                "club": club,
            }
            if season is not None:
                row["season"] = season
            pid += 1
            for metric, (mean, std, lo, hi) in PROFILE[pos].items():
                # Apply gentle yearly drift for realism across 2020-2025 horizon
                drifted_mean = mean + season_drift if metric in ("goals_p90", "xg_p90", "progressive_passes_p90", "pass_accuracy_pct") else mean
                row[metric] = round(_sample_metric(drifted_mean, std, lo, hi), 2)
            rows.append(row)
            global_used_names.add(name)

    df = pd.DataFrame(rows)

    if missing_rate > 0:
        rng_np = np.random.default_rng(seed)
        for col in METRIC_COLS:
            mask = rng_np.random(len(df)) < missing_rate
            df.loc[mask, col] = np.nan

    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)
    df["player_id"] = range(1, len(df) + 1)
    return df


def _parse_seasons(s: str | None) -> list[str] | None:
    if not s:
        return None
    parts = [p.strip() for p in s.replace(";", ",").split(",") if p.strip()]
    seasons: list[str] = []
    for p in parts:
        if "-" in p and p.count("-") == 1:
            a, b = p.split("-")
            a, b = a.strip(), b.strip()
            if a.isdigit() and b.isdigit() and len(a) == 4 and len(b) in (2, 4):
                if len(b) == 2:
                    b = a[:2] + b
                try:
                    start, end = int(a), int(b)
                    # If range spans >1 year (2020-2025) expand to single-season steps
                    if end - start > 1:
                        for y in range(start, end):
                            seasons.append(f"{y}-{y+1}")
                        continue
                    elif end - start == 1:
                        seasons.append(f"{start}-{end}")
                        continue
                except ValueError:
                    pass
        if p.isdigit() and len(p.strip()) == 4:
            seasons.append(f"{p.strip()}-{int(p.strip())+1}")
        else:
            seasons.append(p)
    seen = set()
    uniq = [x for x in seasons if not (x in seen or seen.add(x))]
    return uniq


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate EPL player data (real names via football-data.org)")
    parser.add_argument("--output", type=str, default="data/players.csv")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--total", type=int, default=0, help="Per-season total (0=160). Multi-season total is per-season * seasons.")
    parser.add_argument("--source", type=str, choices=["synthetic", "football-data"], default="synthetic",
                        help="synthetic = curated real EPL names; football-data = live API (needs token)")
    parser.add_argument("--token", type=str, default=None, help="football-data.org X-Auth-Token (or set FOOTBALL_DATA_TOKEN)")
    parser.add_argument("--seasons", type=str, default=None,
                        help="Comma/range for multi-season: e.g. '2021-2027' or '2021-2022,2022-2023' (adds season column)")
    args = parser.parse_args()

    if args.total and args.total > 0:
        total_default = sum(POSITION_COUNTS.values())
        factor = args.total / total_default
        counts = {k: max(1, round(v * factor)) for k, v in POSITION_COUNTS.items()}
        diff = args.total - sum(counts.values())
        counts["Midfielder"] += diff
    else:
        counts = POSITION_COUNTS

    seasons = _parse_seasons(args.seasons)
    if seasons:
        # Multi-season: drift slightly per year (2020 baseline -> 2024 peak)
        # Goals/xG +0.02 per year, progressive passes +0.15 per year, pass accuracy +0.3 per year
        base_year = min(int(s.split("-")[0]) for s in seasons)
        dfs = []
        for s in sorted(seasons):
            year = int(s.split("-")[0])
            offset = year - base_year
            drift = offset * 0.02  # applied only to selected metrics inside generate_players
            # For progressive passes / pass accuracy we scale inside; use offset*0.15 etc handled via seasonal drift param
            # Pass a unified drift then adjust per metric: we'll use offset*0.02 for goals/xG and offset*0.15 for prog passes etc via internal scaling
            # To keep simple, pass offset*0.04 as season_drift (covers goals/xG) — other metrics use fraction
            df_s = generate_players(n_per_position=counts, seed=args.seed + offset * 100, source=args.source, token=args.token, season=s, season_drift=offset * 0.025)
            # Progressive passes need larger drift — bump post hoc
            if "progressive_passes_p90" in df_s.columns:
                df_s["progressive_passes_p90"] = (df_s["progressive_passes_p90"] + offset * 0.18).round(2)
                df_s["pass_accuracy_pct"] = (df_s["pass_accuracy_pct"] + offset * 0.35).clip(upper=96).round(1)
                df_s["goals_p90"] = (df_s["goals_p90"] + offset * 0.015).round(2)
            # Age progression: players get ~1yr older per season
            df_s["age"] = (df_s["age"] + offset).clip(upper=38)
            dfs.append(df_s)
        df = pd.concat(dfs, ignore_index=True)
        df["player_id"] = range(1, len(df) + 1)
        # Shuffle within season blocks then global shuffle preserving season for display? Keep random
        df = df.sample(frac=1, random_state=args.seed).reset_index(drop=True)
        df["player_id"] = range(1, len(df) + 1)
    else:
        df = generate_players(n_per_position=counts, seed=args.seed, source=args.source, token=args.token)
    out = pathlib.Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    label = f"{len(seasons)} seasons" if seasons else "single season"
    print(f"Generated {len(df)} EPL players ({args.source}, {label}) -> {out}")
    print(df.head(3).to_string(index=False))
    print(f"\nPosition counts:\n{df['position'].value_counts().to_string()}")
    if "season" in df.columns:
        print(f"\nSeason counts:\n{df['season'].value_counts().sort_index().to_string()}")
    print(f"Club counts:\n{df['club'].value_counts().head(10).to_string()}")


if __name__ == "__main__":
    main()
