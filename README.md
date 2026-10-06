# Football Player Scouting Tool

SCOUT//LAB is an open-source scouting workspace for player comparisons, recruitment searches and shortlists. It retains the original interface, role-relative radars, similarity explanations and multi-season trends.

The recruitment workspace also includes quick player previews, traceable measured summaries, interactive scatter discovery, saved analysis lenses, a cross-project review inbox and structured match observations. Everything runs locally without paid AI/API calls. [Explore the workflow](docs/RECRUITMENT_DESK.md#player-exploration-and-evidence-workflow).

The public release starts with **128 fictional player-season profiles** across four positions and two demo seasons. These are original synthetic fixtures, not current Premier League statistics. Provider datasets, portraits and event files are not distributed with this release. You can import a compatible dataset you are permitted to use locally.

The real-player screenshots below show a separate local installation using the preserved **2025/26 Premier League snapshot**. A fresh clone opens with fictional demo profiles, not these real-player records or live 2026/27 coverage.

## Start here

1. [Run the demo](#run-on-your-device) — no provider account or API key required.
2. [Follow the screenshot walkthrough](#try-the-scouting-workflow) — select a player, find candidates, compare profiles and build a shortlist.
3. [Understand the analysis](#how-the-analysis-works) — learn what percentiles and similarity scores mean.
4. [Import your own compatible dataset](#use-your-own-dataset) when you are ready, or check [troubleshooting](#troubleshooting) if something does not work.

### Demo and real-player examples, side by side

<table width="100%">
  <tr><th width="50%">Included fictional demo</th><th width="50%">Local real-player example</th></tr>
  <tr>
    <td width="50%" valign="top"><a href="docs/screenshots/05-demo-profile-aligned.jpg"><img src="docs/screenshots/05-demo-profile-aligned.jpg" width="600" alt="Complete fictional Demo Winger 01 profile, controls and key metrics"></a></td>
    <td width="50%" valign="top"><a href="docs/screenshots/05-real-profile-aligned.jpg"><img src="docs/screenshots/05-real-profile-aligned.jpg" width="600" alt="Complete local Bukayo Saka 2025/26 profile, controls and key metrics"></a></td>
  </tr>
  <tr><td valign="top"><strong>Demo Winger 01</strong> — synthetic values; included with a fresh clone.</td><td valign="top"><strong>Bukayo Saka</strong> — historical 2025/26 values; requires a separate local import.</td></tr>
</table>

Each pair uses the same capture width and top-aligned layout. Images retain their natural proportions rather than being stretched or cropped to match heights. **Click any screenshot to open its complete full-size view.**

Both examples use the same scouting interface. The fictional profiles demonstrate the workflow; they are not estimates of real players. The real-player captures illustrate a historical local setup, not a live data service or evidence of publication permission.

## Data sources and coverage

| Source or mode | What it contributes | Coverage and limitations |
| --- | --- | --- |
| **Public demo** | 128 original fictional player-season profiles across four positions and two demo seasons. | Included in the repository. No real football observations or provider credentials required. |
| **Real-player screenshots** | Examples featuring Saka, Salah and other Premier League players from the preserved local snapshot. | Performance data is **2025/26**, not live 2026/27. Displayed squad context was last checked **19 September 2026**. Real datasets are not included. |
| [Understat](https://understat.com/) | Historical attacking statistics: goals, expected goals (xG), assists, expected assists (xA), shots, key passes, xGChain and xGBuildup. | Statistical source for the local real-player examples. Does not supply the defensive or full touch-location coverage needed for comprehensive scouting. Current-season access and publication permission remain unverified. |
| [Fantasy Premier League](https://fantasy.premierleague.com/) | Supporting player identity, club and availability context in the local prototype. | Supplemental, fantasy-oriented information—not a complete tactical dataset. Context can become stale; publication permission remains unconfirmed. |
| [API-Football](https://www.api-football.com/) | Optional historical enrichment experiments for defensive and other player statistics. | Not required for the demo and not the primary source for the screenshots. The existing free account rejected 2026/27 access on **4 October 2026**; historical pagination limits also produced partial coverage. |

**Calculated by the tool:** per-90 features, season/position-relative percentiles, reliability adjustments and weighted similarity results are derived from the available inputs. They are not provider-endorsed ratings. Imported playing-style labels are supplied with the dataset; importing does not train or validate a new model.

**Known gaps:** defensive coverage is limited, so attacking-profile similarity should not be treated as a complete assessment of defenders. Touch/action heatmaps require separate event-location observations; shot locations alone are not a touch heatmap. No verified free, permission-cleared live 2026/27 Premier League feed is bundled.

Source attribution describes provenance, not permission, partnership or endorsement. **Permission to publish the real-data screenshots remains unconfirmed**; keeping raw files out of GitHub does not resolve that question. See [the recorded permission and coverage review](docs/permissions/STATUS.md). The importer uses a file you supply and makes no provider downloads; see [the JSON schema and local setup](docs/LOCAL_DATA.md).

## Run on your device

Requirements: Git, Node.js 22 and npm. No provider account or API key is needed for demo mode.

```sh
git clone https://github.com/sagar-varshney/football-player-scouting-tool.git
cd football-player-scouting-tool/frontend
npm install
npm run dev -- --port 3011
```

Open [localhost:3011](http://localhost:3011). Start in **Recruitment desk**: define a search, review candidates and build your shortlist. You can also explore profiles, adjust similarity priorities and compare radars. Saved searches, shortlists, recruitment projects and analysis lenses live in your browser—not a cloud account.

For a production build, run `npm run build` followed by `npm run start -- --port 3011`.

## What the tool does—and does not do

Use SCOUT//LAB to explore attacking and creative profiles, find statistically similar players, compare strengths, track season-to-season changes and organize recruitment notes.

It is **decision support, not a player-quality ranking, transfer recommendation or prediction of future performance**. A high similarity score means two profiles resemble each other on the available metrics; it does not mean they are equally good or would perform the same in your team. Pair the results with video, tactical context and your own scouting judgment.

Defensive actions, off-ball movement, physical attributes and team tactical context are not comprehensively represented in the current comparison. A defender's attacking profile is not a full assessment of their defending. Fictional demo results demonstrate the interface, not real football findings; local imports are only as accurate and current as their inputs.

## How the analysis works

1. **Per-90 inputs:** compare output relative to playing time rather than totals. Imports must supply compatible per-90 values; the importer does not convert raw totals for you.
2. **Small-sample adjustment:** ranking values blend a player's per-90 value with the position/season cohort average using a **900-minute prior**. Short samples move more toward the average; recorded per-90 values remain visible unchanged.
3. **Position/season percentiles:** adjusted values are ranked within the selected position and season. A 90th percentile is a relative rank in that dataset, not a 90/100 overall ability rating.
4. **Weighted similarity:** the tool compares percentile gaps using position-specific weights. **Goal threat**, **Chance creator**, **Link player** and the sliders change those weights—not the underlying statistics.

Playing-style labels and clusters come from the supplied dataset. The public demo uses fictional labels; importing a file does not train a new model. Similarity is calculated in the interface, and stability indicators show sensitivity to the predefined recruitment briefs—not a probability of scouting success. See [the analysis guide](docs/ANALYSIS.md) for the formulas, examples and interpretation limits.

## Try the scouting workflow

### Recruitment desk

Open **Recruitment desk** to try the full workflow with the included fictional profiles—no provider account or API key is required.

1. **Define your search:** choose a plain-language starting point, position, season and playing time. Expand **Fine-tune targets** for exact thresholds and weights.
2. **Review candidates:** browse fit/trade-off cards and use **View player** for a quick side-panel preview without losing your filters or position. Expand summary findings to inspect the supporting numbers. Select up to four players and choose **Compare selected**; **Met / Missed / Unknown** summaries lead, with exact numbers available on demand.
3. **Your shortlist:** save directly from a card or preview. Open **Notes & next steps** for observations, actions, review dates and decision history. The **Scouting review inbox** brings outstanding tasks across your projects together. Export/import project backups or preview a printable dossier.

### Explore, observe and follow up

| Feature | How to use it |
| --- | --- |
| **Quick previews and measured summaries** | Use **View player** on a candidate card. Expand a finding to see the recorded /90 value, adjusted percentile and comparison group. Close the drawer to return to the same search; choose **Full report** for detailed analysis. |
| **Interactive scatter discovery** | Open **Profile charts → Explore the player pool**. Choose an axis preset, search a name/club, or size dots by minutes. Click a dot to preview the player. The expandable **Accessible player table** offers keyboard-friendly preview, shortlist and comparison actions. |
| **Saved analysis lenses** | In **Profile charts**, expand **Customize this view** to select radar metrics and similarity category priorities. **Saved analysis lenses** stores the current chart settings under a name for that position. Applying a lens does not change your search requirements or raw data. |
| **Scouting review inbox** | Open **Your shortlist** to filter tasks by deadlines, changed imported records, missing evidence or pending observations. **Open review** takes you to that candidate's notes. These are local reminders, not live alerts or a scheduled monitoring service. |
| **Structured match observations** | Open a candidate's **Notes & next steps → Add match observation**. Record match date, opponent, role, category, timestamp, note and an optional evidence link. Choose **Not observed** when the viewed material cannot support an assessment. Observations can be edited and travel with project JSON exports and dossiers. |

Manual observations do not feed statistical scores. Automated summaries use explicit rules, not a paid AI service, and do not invent defensive ability, tactical fit or transfer predictions. Lenses select chart metrics and similarity priorities; they do not retrain a model or change the similarity feature set.

**Keep your work:** project JSON exports preserve search settings, notes, observations and decision history. Importing creates a separate copy and requires a compatible dataset to resolve player references. Lenses are stored separately in the browser and are not included in project exports. Use the same browser, host and port; clearing site storage removes saved work.

Optional **Analysis tools** contains selected-player diagnostics and whole-dataset audits. Dossiers use the browser's **Save as PDF** destination; audits export JSON. No external AI or provider requests are required.

The demo's numbers and dates are synthetic, not current football evidence. These features make no provider requests and do not change the source statistics or train a model. See [the recruitment desk guide](docs/RECRUITMENT_DESK.md) for details and limits. Export project backups before clearing browser storage.

![Fictional demo: the guided Define your search screen with plain-language presets, position, season, playing-time controls and expandable targets](docs/screenshots/09-demo-recruitment-desk.jpg)

These screenshots were captured from the local app with an imported dataset, using **Bukayo Saka and Mohamed Salah** as examples. Performance data shown covers **2025/26**; any displayed squad context was last checked **19 September 2026** and may be stale. Statistical source: [Understat](https://understat.com/). Supplemental squad context: [Fantasy Premier League](https://fantasy.premierleague.com/). Screenshots illustrate the interface; publication permissions for these sources remain unresolved, as recorded in [the source review](docs/permissions/STATUS.md).

You can follow the same workflow with fictional players immediately after installation. Real-player examples require your own compatible, permitted import; those datasets are not included in this repository.

### 1. Choose a player

Select **Winger** and **2025-2026**, then choose **Bukayo Saka** in the player selector if your imported dataset contains him. The profile shows his playing-style label, minutes and strongest metrics. Set **Matches shown** to 3, 5 or 10 to control the recommendation list. The workspace preview above shows these controls. In demo mode, use **Demo Winger 01** instead.

### 2. Find candidates for a recruitment brief

Open **Finder** in the navigation. Choose a priority metric such as **Key passes**, then set a minimum percentile and minutes threshold. Add club or playing-style filters to narrow the pool. Click a player's name to scout them, **+ Save** to shortlist them, or **+ Save this search** to revisit the filters later.

The fictional example uses **Key passes, 75th+ and 900+ minutes**. The real-player example adds **Wide Playmaker** and raises the threshold to **90th+**, showing Cherki, Doku, Foden and Szoboszlai. These are separate search examples, not equivalent player pools.

<table width="100%">
  <tr><th width="50%">Fictional recruitment search</th><th width="50%">Real-player recruitment search · 2025/26</th></tr>
  <tr>
    <td width="50%" valign="top"><a href="docs/screenshots/06-demo-finder-aligned.jpg"><img src="docs/screenshots/06-demo-finder-aligned.jpg" width="600" alt="Complete fictional recruitment finder with filters and all four results"></a></td>
    <td width="50%" valign="top"><a href="docs/screenshots/06-real-finder-aligned.jpg"><img src="docs/screenshots/06-real-finder-aligned.jpg" width="600" alt="Complete real-player recruitment finder with filters and Cherki, Doku, Foden and Szoboszlai"></a></td>
  </tr>
</table>

For another view of fit, use **Balanced role**, **Goal threat**, **Chance creator** or **Link player** above the finder. These priorities change similarity rankings; they do not change the underlying recorded or imported values.

### 3. Compare player profiles

Open **Compare**, then select a recommendation in **Compare with**. The screenshot compares **Bukayo Saka (pink)** with **Mohamed Salah (green)**. The radar and table show percentiles within the selected season and position; the difference bars highlight where the profiles diverge. Similarity describes a statistical match, not an overall player-quality score.

<table width="100%">
  <tr><th width="50%">Demo Winger 01 vs Demo Winger 12</th><th width="50%">Bukayo Saka vs Mohamed Salah · 2025/26</th></tr>
  <tr>
    <td width="50%" valign="top"><a href="docs/screenshots/07-demo-radar-aligned.jpg"><img src="docs/screenshots/07-demo-radar-aligned.jpg" width="600" alt="Complete fictional comparison with percentile table, radar, legend and difference bars"></a></td>
    <td width="50%" valign="top"><a href="docs/screenshots/07-real-radar-aligned.jpg"><img src="docs/screenshots/07-real-radar-aligned.jpg" width="600" alt="Complete Saka versus Salah comparison with percentile table, radar, legend and difference bars"></a></td>
  </tr>
</table>

### 4. Build a shortlist and record your decision

Save two players, then open **Shortlist**. This example saves **Saka and Salah**, sets Salah's status to **Review**, and adds an illustrative scout note. Set a decision status (**Watching**, **Review** or **Priority**) and add your own notes. With at least two players, a comparison matrix appears. Use **Export CSV** for a spreadsheet or **Print report** for a printable view. Saves and notes persist in the same browser; they are not synced between devices.

<table width="100%">
  <tr><th width="50%">Fictional shortlist and example notes</th><th width="50%">Salah and Saka shortlist · 2025/26</th></tr>
  <tr>
    <td width="50%" valign="top"><a href="docs/screenshots/08-demo-shortlist-aligned.jpg"><img src="docs/screenshots/08-demo-shortlist-aligned.jpg" width="600" alt="Complete fictional shortlist with status, example notes, export controls and comparison matrix"></a></td>
    <td width="50%" valign="top"><a href="docs/screenshots/08-real-shortlist-aligned.jpg"><img src="docs/screenshots/08-real-shortlist-aligned.jpg" width="600" alt="Complete Salah and Saka shortlist with status, example notes, export controls and comparison matrix"></a></td>
  </tr>
</table>

These captures use initials rather than player photographs. Shot maps, portraits and action maps require suitable optional data assets. The demo leaves unavailable observations empty rather than inventing them. Follow the import instructions below to use a dataset you are permitted to use.

## Use your own dataset

```sh
cd frontend
npm run import-data -- /absolute/path/to/scouting-data.json
```

Copy `.env.example` to `.env.local`, set `SCOUTING_DATA_MODE=local`, and restart. Profiles live in ignored `.local-data/`; the importer does not download provider data. See [the schema and local setup](docs/LOCAL_DATA.md).

Only import material you are permitted to obtain, retain and use. Browser-visible data remains accessible. Hosting imported data requires applicable display/export permissions. Open-source code does not grant provider-data rights.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Installation or startup fails | Run `node --version` and `npm --version`. Use Node.js 22, run commands inside `frontend/`, and install dependencies with `npm install`. For production startup, run `npm run build` first. |
| Port 3011 is already in use | Choose another port: `npm run dev -- --port 3012`, then open `http://localhost:3012`. Browser-saved lists are separate on different ports. |
| Import is rejected | Follow [the JSON contract](docs/LOCAL_DATA.md): at least two profiles, supported numeric per-90 features, valid identities and positions, and no duplicate profiles. Supply a JSON file, not a CSV or raw API response. Read the import command's error before retrying. |
| Local profiles are unavailable, or the demo still appears | Import successfully, set `SCOUTING_DATA_MODE=local` in `frontend/.env.local`, then stop and restart the server from `frontend/`. To return to the demo, set the mode to `demo` and restart. |
| No players match the Finder filters | Broaden the percentile/minutes criteria and reset club/style filters. Leave age and availability unrestricted if your dataset does not supply that context. |
| Photos, shot maps or action maps are unavailable | Profile imports do not include these optional assets. Initials and unavailable-map notices are expected on a clean clone; statistics alone cannot create observed touch locations. |
| A saved shortlist or search has disappeared | Use the same browser, host and port. Saves are browser-local, not account-synced; private browsing or clearing site storage can remove them. |
| A saved lens is not listed | Lenses are position-specific. Choose the position used when saving it, and use the same browser, host and port. Project imports do not restore lenses. |
| The inbox still asks for an observation | **Not observed** records the evidence gap; it does not count as an observed match assessment. Acknowledging a dataset update also does not clear overdue dates or missing observations. |

**Resetting saved items:** export your shortlist CSV first if you want to keep a reference. In **Shortlist**, use **Clear** to remove saved players, statuses and notes for that browser origin. In **Finder**, use the **×** beside an individual saved brief to delete it. These actions do not change the imported dataset. Clearing all browser site storage also removes saved items and cannot be undone through the tool.

## Scouting workflows

- Position/season filters, searchable profiles and per-90 measures.
- Role-relative percentiles with a 900-minute reliability prior.
- Weighted similarity with finishing, creation and involvement explanations.
- Recruitment finder, saved searches, scatter plots and radar comparisons.
- Multi-season trends, shortlist notes/status, CSV exports and printable views.
- Threshold-based briefs, explained near-misses and four-candidate requirement comparisons.
- Recruitment projects with review dates, next actions, decision history and portable JSON backups.
- Printable dossiers and local, dataset-wide ranking sensitivity audits.
- Quick previews with expandable, numerical evidence behind measured summaries.
- Interactive whole-cohort scatter discovery and position-specific saved analysis lenses.
- Cross-project review inbox and structured manual match observations.
- Dataset-mode/season labels and recoverable loading errors.
- Optional portrait, shot-map and historical event modules when suitable local assets are supplied.

Synthetic style groups are fixtures, not trained or validated football conclusions. The legacy Python pipeline is retained for separately authorized datasets; collectors are not a required installation step. Current touch heatmaps require current event coordinates. No verified free, cleared current-season PL provider is bundled. [Permission and coverage evidence](docs/permissions/STATUS.md).

## Development

```sh
cd frontend
npm test
npm run build
```

Python source and legacy tests are optional and require `requirements.txt` plus compatible local inputs. Dataset-dependent tests cannot run on a clean demo-only clone. CI checks the import boundary, absence of provider assets and frontend build without calling providers. Frontend tests cover missing-data handling, search presets, project/observation validation and round trips, lens validation, review-task detection and ranking diagnostics.

## Publication and licences

Original code, original documentation and synthetic fixtures are covered by [the MIT licence](LICENSE). Dependencies retain their own licences. This licence does not grant rights to third-party datasets, photographs, trademarks or any third-party content shown in screenshots. The included real-player screenshots are demonstrations, not a grant of provider-data rights or confirmation of publication permission.
