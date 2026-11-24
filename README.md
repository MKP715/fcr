# GSC Service Explorer

A personal study app for the U.S./Canada General Service Conference (GSC) of Alcoholics Anonymous:
who the delegates are, which Conference committee each area holds, who chairs what, the General Service
Board and its committees, GSO Staff assignments, when seats rotate — and a model of how the next panel's
committee draw is likely to fall.

**Open it:** double-click `index.html` (works offline from disk, except the map tiles), or serve the folder
with any static host. No build step, no server.

**Tip:** add `?today=2027-02-15` to the address (e.g. `index.html?today=2027-02-15`) to see the app as of any date —
a handy way to learn how the service year turns over (elections, Jan 1 hand-off, the Conference, the Final Report).

**Project state / picking up after an interruption:** a local, untracked `RESUME.md` (task ledger, locations, health check; backed up in the Drive data folder).

## What's inside

| Page | What it answers |
|---|---|
| **Today** | Where the service year stands: the next Conference (dates, venue, theme, countdown, where its proposed agenda items stand, the latest board weekend), what's coming up, who is serving and rotating, the current board officers, next year's chairs, and a *My area* panel (default Area 65) with the next delegate's committee odds. |
| **Calendar** | "What to expect when": board weekends, the proposed-agenda-item deadline (Sept 30), background material, the Conference, Box 4-5-9 and the Final Report, Regional Forums, International Conventions, World Service Meetings, trustee résumé deadlines, Southwest and Area 65 events — with countdowns, filters (Area 65 / Southwest / everything) and .ics export. |
| **Delegates & Map** | All 93 areas on a map and in a searchable table — any Conference year, "serving today", or next year's projection, filtered by region, panel, committee or "rotating this year". |
| **Committees** | Each Conference committee by year: members by panel, chair/alternate, standard size, GSO Staff secretary, trustees' counterpart (linked to the Structure page), next year's chair candidates; "Conference at a glance"; chairs history newest first. |
| **Rotation Grid** | Area × panel matrix of committee assignments since Panel 66, with the model's example draw for the next panel — highlight any committee to see how it moves around the map. |
| **Predict** | The rules GSO's December draw follows (by lot; skip the area's last three committees; one new member per region; regions spread across each committee; neighbouring areas and areas of the same state/province kept apart; seats refilled to standard sizes; IC/RF one per region and rotating within it), each with evidence and a switch to try the model without it; precise precomputed odds for the next panel, "Why these odds?" for any area, "Who could land here?" for any committee, honest out-of-sample accuracy, rules tested and rejected, and a watch list for the next draw. |
| **Trustees & Boards** | Current officers, the latest board weekend in brief, the 21–22 trustees by class and position (rotation, first-term ends), nontrustee directors, newly elected, a bordered grid of who sits on which trustees' committee (with member counts and staff secretaries), AAWS & Grapevine boards. |
| **Board Weekends** | The General Service Board's quarterly weekends, starting with fall 2026 (Oct 29 – Nov 2): what the AAWS and Grapevine boards, the trustees' committees and the board did, one card per report in the packet sent to Conference members (summary, the board's vote, highlights, recommendations, proposals decided, key figures, dates ahead, follow-ups), what it means for the next Conference, and the figures worth knowing. Page numbers are PDF pages of the packet. |
| **GSO Staff** | Staff desks by year (one chip per committee), rotation history and who runs the December draw. |
| **Openings** | Seats opening at each Conference through 2031 (with successors, who nominates, résumé deadlines) and a Gantt of every board seat. A step-by-step tracker for the next regional trustee election (your region first: the Southwest elects in 2027), with real dates for each step from the May notice to the annual meeting and the current step highlighted. |
| **Advisory Actions** | Every Advisory Action of the Conference 1951–2026 (an index of GSO item M-39: year, committee or topic, a plain-words summary, floor/not-adopted marks, a link to the page of the original on aa.org). On top, **pending follow-ups**: everything dated for later (reports due at a coming Conference, deadlines, items deferred to a later year — from the Advisory Actions and from the requests in the Final Reports), grouped by due date and receiving committee so none is missed, with progress reported since (e.g. at the fall 2026 board weekend), and the ones that fell due at the last Conference with what became of them. Browse by committee, decade or year, search the summaries. Follow-ups also appear in the Calendar. |
| **Agenda Items** | The proposed agenda items (PAIs) for the next Conference — 221 for the 77th (April 2027), from GSO's status grid of November 6, 2026, after the fall board weekend — each summarized in plain words with what the trustees' committee or board decided and why: *forwarded* to the Conference (alone or folded into a general topic), *no action*, or *still open* (interim meetings, referrals); withdrawn, superseded and held-over items keep their status. Also: what goes to the 77th Conference (the agenda entries by Conference committee), where the cycle stands now (deadline, trustees' committees, preliminary and final agenda, background), trends (themes, when they arrived, which body received them, what they ask, who sent them, the same wording sent by many), an explainer per theme with its history and the related Advisory Actions, every proposal with filters and search, what became of last year's 110, and how a proposal travels to the agenda. |
| **Structure** | The whole service structure as an interactive org chart (after the Service Manual's Appendix C charts): groups → districts → area assemblies → the Conference (delegates by region and area, Conference committees) → the General Service Board (trustees, trustees' committees) → AAWS / AA Grapevine and their offices, filled in with the names of any report year; click a box for who serves there, fold/unfold, zoom. Below it, each Conference committee paired with its trustees' committee (or the AA Grapevine board, or none), with everyone on both sides. |
| **Learn** | The service structure as an explorable tree built from *The A.A. Service Manual 2026–2028* (120 topics, including the Twelve Concepts essays, a founding-era timeline 1935–1962, the Traditions, the 1955 Resolution, listing a group, how the manual itself changes and a board-weekend topic drawn from the fall 2026 board reports), with page-cited facts and quotes, the Delegate Chair, the committee-selection history, structure changes, about 100 practical rules, the service year as the manual describes it, a delegate's two-year term step by step (with where each serving panel is today), and an A–Z glossary of about 210 terms. |
| **Quiz** | Shuffled-deck self-test from the Service Manual, with some questions from the Final Reports and the fall 2026 board reports (about 410 page-cited questions; every Learn topic has some, and each topic's deck also takes its generated cards), two generated decks — *Which Concept?* (56 cues) and *Which committee does this?* (77 Conference and trustees' committee duties, pp. 46–48, 58–60) — the rosters, the draw rules and the calendar; "My region" mode; quiz yourself on any Learn topic. |
| **Reports** | The Final Report library in Google Drive: 65 of the 76 Conferences (1951–2004, 2009, 2017–2026; not yet 2005–2008, 2010–2016) on a year-by-year coverage grid, filterable by decade or by theme/hotel, with each report's theme, dates, venue, pages and scan notes; a "Conference at a glance" for 2017–2026, future Conferences, forums, conventions and structure changes; and a *Reference documents* panel (about 45 links: Service Manual editions and history, structure charts, the GSR/DCM shelf, GSO forms and guidelines, Box 4-5-9 and the Quarterly Report, the board weekend packets and status grids). |

The search box (press `/`) finds people (any printed spelling, nicknames, accents), areas (number, name, acronym such as
NETA), regions, committees and abbreviations (CPC, PI, IC/RF), roles ("southwest trustee", "delegate chair"), Learn
terms, calendar items, proposed agenda items ("PAI 38", "item 38" or "proposal 38", any words of a summary, a status such
as "no action") and the agenda topics they went into ("general topic charter"), board weekend reports and figures
("literature committee report", "grapevine subscriptions"; once that weekend has ended) and pages.

## Data

* `data/src/years/<YEAR>.json` — rosters extracted from each Final Report (2017–2026) and audited line-by-line
  against the PDF page images. Schema: `tools/YEAR_SCHEMA.md`; check with `python tools/validate_year.py data/src/years/*.json`.
* `data/src/corrections.json` — small, source-cited fixes applied at build time (e.g. the Class B chair seat since 2024).
* `data/src/reports.json` — the Final Report library: theme, dates, venue, pages, edition and scan notes for each year, read
  from the PDFs' covers, plus the Drive file link and name (`<year> - <Nth> GSC Final Report - <theme, or venue> (<edition>).pdf`;
  `--check` rejects folder links, odd names and duplicate years); `drive.json` — the Drive folder links and the reference documents (`docs`: title, url, why = tooltip, group; `main` = shown in the top row).
* `data/src/areas.json` (`tools/areas_seed.py`) — 93 areas, regions (verified against Service Manual Map B and the
  reports' regional headings), approximate map points; `area_websites.json` — official names and websites from aa.org.
* `data/src/rules.json` — Service Manual rules with page-cited quotes; regional trustee election calendar.
* `data/src/panel_elects.json` — delegate-elects found on area websites (names as first name + last initial).
* `data/src/analysis.json` — committee-assignment evidence, model defaults, honest (forward-chained) accuracy, rejected rules
  and the watch list (`node tools/dev/model_report.js`); `data/src/forecast.json` — precomputed odds for the pending panel(s)
  (`node tools/dev/precompute_forecast.js`; `--check` tells you when it is stale).
* `data/src/conferences.json` — per-Conference facts, future Conference dates, forums, conventions, WSM/REDELA, structure
  changes, finance headlines, delegate chairs, group contributions by area; `data/src/board.json` — post-Conference slates
  (with the AAWS and Grapevine board chairs once a board report names them), emeriti, general managers, staff roles; `data/src/calendar.json` — recurring rules and dated events for the Calendar.
* `data/src/advisory_actions.json` — an index of M-39 *Advisory Actions of the General Service Conference 1951–2026*
  (© AAWS): year, section, page, an own-words summary (≤ 34 words), flags, topics and follow-up dates — never the
  original wording, which stays in the PDF (aa.org and Drive). Written by `tools/dev/m39_merge.py` from a checked, verified
  extraction; `--check` validates it and compares the 2017–2026 yearly totals with the Final Reports' counts; every build
  adds a Calendar event for each Conference, stated month or "during" year that has follow-ups due.
* `data/src/followups.json` — requests in the Final Reports (committee, board, trustees' and G.S.O. reports) that are not
  Advisory Actions: progress reports and drafts asked for at a later Conference, items recommitted to a committee, other
  dated plans, and recommendations committed to the General Service Board (no date); plus what became of each follow-up
  once it fell due, and progress noted before then (`progress`, `action_progress`, e.g. at a board weekend). Shown with the
  Advisory Action follow-ups as *pending follow-ups*.
* `data/src/pai.json` — the proposed agenda items of the next Conference, from GSO's PAI status grid (sent to Conference
  members after each board weekend): number, date received, body it was sent to, status (`forwarded`, `forwarded_topic` =
  folded into a general topic, `no_action`, `under` = still open, `withdrawn`, `superseded`, `removed`, `deferred`), what
  the trustees' committee or board decided and why (`decision`, cited to the board-report packet), an own-words summary,
  themes, related Advisory Actions, the likely Conference committee, plus the agenda entries forwarded (`agenda_topics`),
  what is still open and when it is decided (`open_meetings`), theme explainers, last cycle's outcomes and the PAI process.
  The grid prints each motion as submitted, with group names; this repository keeps neither the submitted wording nor any
  group name or service number, and the grids themselves live in the Drive data folder. `--check` validates it.
* `data/src/board_meetings.json` — the board weekends, newest first (now the fall 2026 weekend): one own-words card per
  report in the packet GSO sends Conference members (board, trustees' committees, sessions, the minutes' view merged in),
  the dates ahead and key figures, each cited "Q4 2026 board reports p. N" (N = PDF page). The packet stays in Drive.
  `--check` validates it (pages, word limits, ids against calendar.json, followups.json and pai.json).
* `python tools/build_data.py --check` bundles everything into `data/fcr-data.js` (loaded by `index.html`).

**Anonymity:** every A.A. member is recorded as first name + last initial, as in the anonymity-protected edition.
No report PDFs, addresses, phone numbers or e-mails are stored in this repository; the PDFs live in Google Drive.

## Adding next year's report

1. Save the new Final Report PDF in the Drive folder.
2. Ask Claude to extract it to `data/src/years/<YEAR>.json` following `tools/YEAR_SCHEMA.md`, validate it, and run
   `python tools/build_data.py --check`.
3. Refresh the model: `node tools/dev/model_report.js`, `node tools/dev/precompute_forecast.js`, rebuild, then
   `node tools/dev/search_test.js` and a render check (`node tools/dev/shoot.js --out <dir> today predict calendar …`).

After a board weekend, save the board-report packet and the new status grid in Drive, then add the weekend to the top of
`data/src/board_meetings.json` and the grid's statuses and decisions to `data/src/pai.json` (own words, page-cited; the
schema is in `tools/YEAR_SCHEMA.md` and `build_data.py`), rebuild with `--check` and run the search test.

*Personal study aid — not an official A.A. publication. A.A. literature is © Alcoholics Anonymous World Services, Inc.*
