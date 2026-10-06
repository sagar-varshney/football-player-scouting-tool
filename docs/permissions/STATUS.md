# Current Premier League data: permission and coverage status

Reviewed 4 October 2026. Product requirements: preserve the original app, Premier League only, current 2026/27 statistics, no paid services. This is an engineering evidence record, not a legal determination.

## Findings

| Source | Evidence | Current decision |
| --- | --- | --- |
| Understat | Original pipeline defaults to start years 2021–2025; README documents 1,854 profiles and 48,492 shots. Official homepage lists support@understat.com. The web research tool could not open the 2026 season page; that failure does not establish absence of data. | Current-season availability and permission remain unverified. Primary permission draft prepared; unsent. No new bulk collection performed. |
| API-Football | Authenticated request to `/players?league=39&season=2026&page=1` rejected the existing key with `Free plans do not have access to this season, try from 2022 to 2024.` | Confirmed unsuitable for current PL statistics under this account's existing free access. Do not rerun pagination or buy an upgrade. Optional community-access inquiry prepared. |
| FPL | Original app uses identity, club, availability and news. Premier League website terms restrict database reuse and redistribution absent written approval; applicability and permission for specific FPL access need clarification. | Separate request prepared for routing via the published general contact. Unsent. |
| StatsBomb | Original heatmap/event module is 2015/16 data, according to repository documentation. | Does not meet the current-data requirement. Understat permission would not grant current touch/action heatmap coverage. Historical redistribution review remains separate. |
| Wikimedia Commons | Existing portrait/credit system is separate from statistical sources. | Review exact file licences, attribution, transformations and relevant non-copyright restrictions before release. No blanket approval or blanket prohibition inferred. |

API probe details: one sandbox attempt failed DNS before reaching the provider; one host-network attempt returned the season restriction. The existing local quota ledger counts both attempts conservatively. No key was printed, no provider data rows were saved, and no normalized dataset was replaced.

## Original app dependencies inspected

- `scripts/build_free_data.py`: player-season endpoint and default seasons `2021-2025`.
- `scripts/build_understat_shot_data.py`: player-shot endpoint, with eight workers by default. This default must not be used for a future refresh unless consistent with the provider's permission.
- `frontend/app/page.tsx`: publicly fetches scouting JSON, shot JSON, event JSON and portrait manifest; offers shortlist CSV and print reports.
- `README.md` and `DATA_SOURCES.md`: historical coverage and past API-Football test results.

## Implementation order after permission is resolved

1. Record the exact allowed use and separately verify current 2026/27 coverage with a small permitted sample. Check season, latest match date, player/team identity, field completeness and minutes.
2. Retain the original interface and implement a provider adapter with private credentials/cache only to the extent allowed. Enforce provider limits and a zero-spend ceiling. Browser-visible statistics still constitute disclosure; a backend does not substitute for permission.
3. Rebuild per-90 features, season/position percentiles and similarity only from verified current-season inputs. Show data timestamps and sample size. Review the existing 450-minute cutoff for early-season coverage; do not silently substitute previous-season records.
4. Keep shot-density maps distinct from touch/action heatmaps. Only enable current positional heatmaps if a source actually provides permitted current positional observations.
5. Enable exports, photos and each supplemental source only within their own verified scope. Review dependencies and licence notices separately from data rights.
6. Prepare a concrete public-data cleanup/release diff. Obtain the owner's approval before changing repository visibility, rewriting published history, deleting material or pushing a replacement. Existing public history is not cleaned by deleting files in a new commit.

## Pending external steps

The owner should review and send the drafts in [PROVIDER_REQUESTS.md](PROVIDER_REQUESTS.md). No messages have been sent. There is no provider approval yet and no verified free replacement satisfying the full current-PL feature set. A response requiring payment would not meet the project constraints.

## Official references checked

- https://understat.com/ — contact address; no permission inferred from public accessibility.
- https://www.api-football.com/terms — Service & data and availability provisions.
- https://www.api-football.com/pricing — free plan and season limitations.
- https://www.premierleague.com/en/terms-and-conditions — reuse provisions and general contact.

The original app, datasets and public repository have not been replaced by this review. These notes and drafts do not certify either app as legally cleared.
