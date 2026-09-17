"""Customer-facing football names for provider records.

Raw provider names remain untouched in the normalized source files. This module
only controls the preferred name exported to product surfaces, keyed by the
provider's stable player ID so a spelling correction cannot merge two players.
"""

from __future__ import annotations

from html import unescape


UNDERSTAT_DISPLAY_NAMES: dict[int, str] = {
    987: "Joe Gomez",
    2496: "Martin Ødegaard",
    5613: "Gabriel Magalhães",
    6674: "Rayan Aït-Nouri",
    8094: "Rayan Cherki",
    8127: "Amad Diallo",
    8831: "Destiny Udogie",
    8864: "Matty Cash",
    9021: "Pape Matar Sarr",
    11763: "Abdukodir Khusanov",
    11772: "Yehor Yarmoliuk",
    12410: "Josh King",
    13066: "Ferdi Kadıoğlu",
    13222: "Igor Thiago",
}


def preferred_player_name(raw_name: object, provider_player_id: object | None = None) -> str:
    """Return a clean, recognisable football name for an Understat player."""

    cleaned = unescape(str(raw_name)).strip()
    try:
        player_id = int(provider_player_id) if provider_player_id is not None else None
    except (TypeError, ValueError):
        player_id = None
    return UNDERSTAT_DISPLAY_NAMES.get(player_id, cleaned)
