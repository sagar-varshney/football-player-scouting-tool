"""Build a licence-audited Wikimedia Commons player portrait library.

The importer is intentionally conservative. It accepts only an exact English
Wikidata label that resolves to one association-football player with a P18
image, then verifies an allow-listed free licence through Commons metadata.
Ambiguous, unmatched, or incompletely licensed players keep the product's
initials fallback.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import json
import pathlib
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parents[1]
INPUT_PATH = ROOT / "frontend" / "public" / "scouting-data.json"
OUTPUT_DIR = ROOT / "frontend" / "public" / "player-images"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
CREDITS_PATH = ROOT / "PLAYER_IMAGE_CREDITS.md"
WIKIDATA_ENDPOINT = "https://www.wikidata.org/w/api.php"
COMMONS_ENDPOINT = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "football-player-scouting-tool/1.0 (https://github.com/sagar-varshney/football-player-scouting-tool)"
ALLOWED_LICENSE_PREFIXES = ("CC BY ", "CC BY-SA ", "CC0", "Public domain", "Public Domain")
MIME_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
REVIEWED_WIKIDATA_ITEMS = {"Mohamed Salah": "Q1354960"}


def request_json(url: str, params: dict[str, str], attempts: int = 3) -> dict:
    target = f"{url}?{urllib.parse.urlencode(params)}"
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(target, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=25) as response:
                return json.loads(response.read().decode("utf-8"))
        except (OSError, ValueError, urllib.error.URLError) as error:
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Request failed after {attempts} attempts: {last_error}")


def chunks(values: list[str], size: int) -> list[list[str]]:
    return [values[index:index + size] for index in range(0, len(values), size)]


def clean_metadata(value: object) -> str:
    raw = str(value or "")
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", raw))).strip()


def identity_key(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value).casefold())
    ascii_name = "".join(character for character in normalized if not unicodedata.combining(character))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_name).split())


def license_allowed(license_name: str) -> bool:
    return license_name.startswith(ALLOWED_LICENSE_PREFIXES)


def search_footballer(name: str) -> tuple[str, str | None, bool]:
    try:
        payload = request_json(
            WIKIDATA_ENDPOINT,
            {
                "action": "wbsearchentities",
                "format": "json",
                "language": "en",
                "uselang": "en",
                "type": "item",
                "limit": "7",
                "search": name,
            },
            attempts=2,
        )
    except RuntimeError:
        return name, None, True
    exact = {
        item["id"]
        for item in payload.get("search", [])
        if identity_key(item.get("label", "")) == identity_key(name)
        and "football" in item.get("description", "").casefold()
    }
    return name, next(iter(exact)) if len(exact) == 1 else None, False


def wikidata_portraits(names: list[str]) -> tuple[dict[str, dict[str, str]], set[str]]:
    item_by_name: dict[str, str] = {}
    failed_names: set[str] = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(search_footballer, name) for name in names]
        for index, future in enumerate(concurrent.futures.as_completed(futures), start=1):
            name, item_id, failed = future.result()
            if failed:
                failed_names.add(name)
            elif item_id:
                item_by_name[name] = item_id
            if index % 100 == 0:
                print(f"Checked {index}/{len(names)} player identities", flush=True)
    item_by_name.update({name: item_id for name, item_id in REVIEWED_WIKIDATA_ITEMS.items() if name in names})

    entities: dict[str, dict] = {}
    for batch in chunks(sorted(set(item_by_name.values())), 50):
        try:
            payload = request_json(
                WIKIDATA_ENDPOINT,
                {
                    "action": "wbgetentities",
                    "format": "json",
                    "props": "claims",
                    "ids": "|".join(batch),
                },
            )
        except RuntimeError:
            failed_names.update(name for name, item_id in item_by_name.items() if item_id in batch)
            continue
        entities.update(payload.get("entities", {}))

    portraits: dict[str, dict[str, str]] = {}
    for name, item_id in item_by_name.items():
        claims = entities.get(item_id, {}).get("claims", {})
        occupations = {
            claim.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
            for claim in claims.get("P106", [])
        }
        images = {
            claim.get("mainsnak", {}).get("datavalue", {}).get("value")
            for claim in claims.get("P18", [])
        }
        images.discard(None)
        if "Q937857" in occupations and len(images) == 1:
            portraits[name] = {"wikidata_id": item_id, "filename": next(iter(images))}
    return portraits, failed_names


def commons_metadata(files: list[str]) -> dict[str, dict]:
    records: dict[str, dict] = {}
    for batch in chunks(files, 25):
        payload = request_json(
            COMMONS_ENDPOINT,
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "prop": "imageinfo",
                "iiprop": "url|mime|extmetadata",
                "iiurlwidth": "420",
                "titles": "|".join(f"File:{name}" for name in batch),
            },
        )
        for page in payload.get("query", {}).get("pages", []):
            info = (page.get("imageinfo") or [{}])[0]
            filename = page.get("title", "").removeprefix("File:")
            if filename and info:
                records[filename] = info
        time.sleep(0.1)
    return records


def download(url: str, destination: pathlib.Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())


def write_credits(manifest: dict) -> None:
    players = sorted(manifest["players"].values(), key=lambda item: item["player_name"])
    lines = [
        "# Player image credits",
        "",
        "These images are reused from Wikimedia Commons under the licence shown for each file. "
        "Images are resized by Wikimedia and displayed with a centre crop in the interface.",
        "",
        "| Player | Creator | Licence | Source |",
        "| --- | --- | --- | --- |",
    ]
    for item in players:
        creator = item["creator"].replace("|", "\\|") or "See source"
        lines.append(
            f"| {item['player_name']} | {creator} | "
            f"[{item['license']}]({item['license_url']}) | [Wikimedia Commons]({item['source_url']}) |"
        )
    lines.extend(["", f"Coverage: {manifest['covered_players']} of {manifest['total_players']} players.", ""])
    CREDITS_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", help="Only include one season, for example 2025-2026")
    parser.add_argument("--limit", type=int, help="Limit the number of unique players for a test run")
    parser.add_argument("--player-id", action="append", type=int, help="Refresh one provider player ID; may be repeated")
    parser.add_argument("--force", action="store_true", help="Redownload existing accepted images")
    args = parser.parse_args()

    payload = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    players_by_id: dict[int, str] = {}
    for player in payload["players"]:
        if args.season and player.get("season") != args.season:
            continue
        provider_id = int(player["provider_player_id"])
        players_by_id.setdefault(provider_id, player["player_name"])
    if args.player_id:
        requested_ids = set(args.player_id)
        players_by_id = {provider_id: name for provider_id, name in players_by_id.items() if provider_id in requested_ids}
    if args.limit:
        players_by_id = dict(list(sorted(players_by_id.items()))[:args.limit])

    scoped_refresh = bool(args.season or args.limit or args.player_id)
    previous_manifest = {}
    if scoped_refresh and MANIFEST_PATH.exists():
        previous_manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    names = sorted(set(players_by_id.values()))
    portraits, failed_batches = wikidata_portraits(names)
    file_metadata = commons_metadata(sorted({item["filename"] for item in portraits.values()})) if portraits else {}
    ids_by_name: dict[str, list[int]] = defaultdict(list)
    for provider_id, name in players_by_id.items():
        ids_by_name[name].append(provider_id)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    accepted: dict[str, dict] = dict(previous_manifest.get("players", {})) if scoped_refresh else {}
    skipped = defaultdict(int)
    for name in names:
        portrait = portraits.get(name)
        if not portrait:
            skipped["ambiguous_or_unmatched"] += 1
            continue
        info = file_metadata.get(portrait["filename"])
        if not info:
            skipped["missing_commons_metadata"] += 1
            continue
        metadata = info.get("extmetadata", {})
        field = lambda key: clean_metadata(metadata.get(key, {}).get("value", ""))
        license_name = field("LicenseShortName") or field("UsageTerms")
        if not license_allowed(license_name):
            skipped["license_not_allowed"] += 1
            continue
        mime_type = info.get("mime", "")
        extension = MIME_EXTENSIONS.get(mime_type)
        image_url = info.get("thumburl") or info.get("url")
        if not extension or not image_url:
            skipped["unsupported_image"] += 1
            continue

        for provider_id in ids_by_name[name]:
            destination = OUTPUT_DIR / f"{provider_id}{extension}"
            if args.force or not destination.exists():
                try:
                    download(image_url, destination)
                except (OSError, urllib.error.URLError):
                    skipped["download_failed"] += 1
                    continue
            description_url = info.get("descriptionurl", "")
            accepted[str(provider_id)] = {
                "player_name": name,
                "path": f"/player-images/{destination.name}",
                "creator": field("Artist") or field("Credit"),
                "license": license_name,
                "license_url": field("LicenseUrl") or description_url,
                "source_url": description_url,
                "wikidata_id": portrait["wikidata_id"],
                "commons_file": portrait["filename"],
                "modifications": "Wikimedia thumbnail; displayed with a centre crop.",
            }

    if not scoped_refresh:
        accepted_files = {pathlib.PurePosixPath(item["path"]).name for item in accepted.values()}
        for existing in OUTPUT_DIR.iterdir():
            if existing.is_file() and existing.name != MANIFEST_PATH.name and existing.name not in accepted_files:
                existing.unlink()

    total_players = previous_manifest.get("total_players", len(players_by_id)) if scoped_refresh else len(players_by_id)
    skipped_summary = dict(sorted(skipped.items()))
    if scoped_refresh and not skipped_summary:
        skipped_summary = previous_manifest.get("skipped") or {"uncovered_after_verification": total_players - len(accepted)}
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Wikimedia Commons via Wikidata P18",
        "policy": "Exact footballer identity match and allow-listed reusable licence; initials are used otherwise.",
        "total_players": total_players,
        "covered_players": len(accepted),
        "uncovered_players": total_players - len(accepted),
        "failed_lookup_players": len(failed_batches),
        "skipped": skipped_summary,
        "players": accepted,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    write_credits(manifest)
    print(f"Library now contains {len(accepted)} verified player portraits")
    print(f"Skipped: {skipped_summary}")


if __name__ == "__main__":
    main()
