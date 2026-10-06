# Provider permission requests

Prepared 4 October 2026. These are unsent drafts for the project owner to review and send. No permission has been obtained. No agreement, fee, or account change is authorized by this document.

## 1. Understat — primary request

To: support@understat.com

Contact verified on https://understat.com/ on 4 October 2026.

Subject: Permission request: free, non-commercial Premier League scouting project

Hello Understat team,

I am developing football-player-scouting-tool, an independent, non-commercial player analysis project focused only on the Premier League. I would like to keep it free to use and use current-season data, with no advertising or paid access proposed.

The prototype uses your player-season statistics to calculate per-90 rates, position-relative percentiles, player similarities and playing-style groups, displayed through player profiles and comparison radars. It also uses shot locations and xG for shot maps. The source fields include player/team/position identifiers, appearances, minutes, goals, assists, shots, key passes, xG, xA, xGChain and xGBuildup.

The existing prototype contains 2021/22–2025/26 data. Some cached data has been included in the project's public GitHub repository: https://github.com/sagar-varshney/football-player-scouting-tool . I am reviewing the permissions before expanding it and would appreciate guidance on any changes required to existing copies and repository history.

Could you confirm whether you can grant permission, without a fee, for the following use?

1. Obtain current 2026/27 EPL player statistics and shot data using an access method you approve. Please confirm whether that season is available and specify acceptable endpoints, request rates and refresh frequency. Weekly or post-match updates would be sufficient; live updates are not required.
2. Store responses privately to avoid repeated requests, retain season history, and calculate the derived scouting analyses described above, including statistical/ML similarity and clustering.
3. Display player statistics, derived metrics, comparison charts and shot maps in a free public web app, with prominent Understat attribution and links in your preferred form. Browser users necessarily receive the displayed values.
4. Allow users to save/print reports and download limited scouting shortlists containing displayed player metrics. Please distinguish whether these exports are permitted separately from ordinary display.
5. Publish the application and analysis code openly. Provider datasets could be excluded from future code releases, subject to your instructions; other developers would need their own authorization to obtain data. Please clarify whether any derived aggregate files may be published and how existing cached copies should be handled.

Please identify any additional rights-holder permissions needed, the scope and duration of your permission, attribution requirements, retention/deletion rules and what should happen if permission ends. If only part of this use is acceptable, please specify that scope so I can adapt the project.

Thank you,
Sagar Varshney

## 2. Premier League — FPL metadata request

To: info@premierleague.com

This is the general contact published in https://www.premierleague.com/en/terms-and-conditions, verified 4 October 2026. Ask for routing to the appropriate data/licensing team; it is not a verified licensing mailbox.

Subject: Please route to data licensing: non-commercial FPL metadata permission request

Hello Premier League team,

Could you please route this request to the team responsible for permissions to reuse Fantasy Premier League data?

I am developing an independent, free, non-commercial Premier League player scouting project, football-player-scouting-tool. I am seeking written permission before expanding its use of current-season FPL data. I have no budget for a paid licence and no advertising or paid access is proposed.

The prototype uses FPL player identity information, club, availability/status and player news as a supplement to scouting profiles. It does not use those fields as similarity-model inputs. Some FPL-derived data has been included in the public repository at https://github.com/sagar-varshney/football-player-scouting-tool . Please advise what changes are required to those copies and their repository history.

Would you permit automated access to specified FPL endpoints, private caching and display of these fields in a free public web app for the 2026/27 season? Please specify the permitted fields, access method, frequency, retention period, attribution and whether limited shortlist/report exports are allowed. If news text cannot be republished, would factual availability labels without the news text be acceptable?

The proposed permission request excludes photographs, club crests and competition logos. Application code would be open source; source datasets could be excluded from future releases, with users of their own installations responsible for their own permissions. Please clarify whether this arrangement is acceptable and whether permission from any additional rights holder is necessary.

If no free permission is available, please let me know so I can plan accordingly.

Thank you,
Sagar Varshney

## 3. API-Football — optional free-access and rights clarification

Send through an official support channel available to the account at https://dashboard.api-football.com/ . Do not include the API key. This is optional: the existing free plan has already failed the current-season test.

Subject: Non-commercial PL project: free 2026/27 access and publication-rights clarification

Hello API-Football team,

I am developing a free, non-commercial Premier League player scouting application with open-source code and no advertising or paid access proposed. On 4 October 2026, my existing key's request to /players?league=39&season=2026&page=1 returned: "Free plans do not have access to this season, try from 2022 to 2024."

Do you offer a no-cost educational/community arrangement for current 2026/27 PL player statistics, without a paid trial or automatic upgrade? I can work with a limited request allowance and weekly updates.

Separately, your Service & data terms state that you do not provide publication licences and that users must obtain necessary permissions. For a free public application displaying player statistics, derived percentiles/similarities and limited shortlist exports, what permissions would be needed and from whom? Please clarify permitted caching/retention and publication of derived metrics. The proposed scope excludes provider images/logos and a public bulk-data API; credentials and cached responses would be private.

I would need both current-season access and a documented basis for public display before integrating the service. Please do not enable a paid plan or billable service.

Thank you,
Sagar Varshney

## Handling replies

- No response is not permission. A reply acknowledging receipt is not permission.
- Record who granted permission, which rights they can grant, exact fields/features, access limits, duration, attribution, storage and export rules, and any additional rights-holder requirements.
- Do not commit private correspondence, signatures, account identifiers or credentials to the public repository. Keep the original reply privately and publish only an approved summary.
- If the response is vague, ask about the unresolved use explicitly before implementing it. Permission from one source does not cover another.
