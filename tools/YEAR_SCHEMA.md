# Per-year roster JSON (one file per Conference year)

Write UTF-8 JSON to `<scratchpad>/data/years/<YEAR>.json`. Validate with
`cd <scratchpad>/tools && python -P -E validate_year.py ../data/years/<YEAR>.json` and fix until there are 0 ERRORS.
Warnings must be either fixed or explained in `notes`.

## ANONYMITY RULE (mandatory)
Every person is recorded as **first name + last initial**, exactly as the anonymity-protected edition prints it,
e.g. `"Luke B."`, `"Lisa C.-D."`, `"Mary Jane R."`, `"Raymond (Ray) J. M."`, `"Teddy B.-W."`.
If the source prints a full surname (older Confidential editions, Class A trustees, non-A.A. employees),
REDUCE it to the initial: `"Jane Ann Doe"` -> `"Jane Ann D."`, `"John Smith"` -> `"John S."`, `"Mary Roe"` -> `"Mary R."`.
Drop professional suffixes (MD, MBA, CPA, FACHE...). Never output street addresses, phone numbers or e-mails.

## Top-level object
```json
{
  "year": 2026,                       // Conference year
  "ordinal": 76,                      // must equal year - 1950
  "theme": "Humility in Action",
  "dates": "April 26 - May 2, 2026",
  "location": "New York Hilton Midtown, New York, NY",
  "source": {"file": "<pdf path>", "edition": "anonymity|confidential", "pages": 178},
  "delegates": [ DELEGATE ... ],
  "conference_committees": [ CONF_COMMITTEE ... ],
  "next_year_chairs": [ NEXT_CHAIR ... ],           // "<year+1> Chairpersons and Alternates" table
  "trustees_committees": [ TRUSTEES_COMMITTEE ... ],
  "gsb_officers": [ {"title": "Chair", "name": "Scott H."} ],
  "trustees": [ TRUSTEE ... ],                      // everyone in the "Conference Members - Trustees" section
  "nontrustee_directors": [ DIRECTOR ... ],
  "newly_elected": [ NEW ... ],                     // trustees/directors elected at/after this Conference
  "aaws_directors": [ {"name": "Ken T.", "role": "Chair, Regional Trustee"} ],
  "grapevine_directors": [ {"name": "David S.", "role": "Chair, General Service Trustee"} ],
  "gso_staff": [ {"name": "Eileen A.", "assignments": ["Trustees", "International Conventions", "Nominating"], "title": ""} ],
  "grapevine_staff": [ {"name": "Jon W.", "title": "Grapevine Editor in Chief"} ],
  "general_manager": "Bob W.",
  "staff_director": "Sandra W.",                    // director of Staff Services if stated, else ""
  "conference_chair": {"name": "Jay T.", "area": 27}, // "Conference delegate chairperson" if stated, else null
  "farewell_count": 48,                             // number of rotating delegates if stated, else null
  "notes": "free text: anomalies, missing sections, explanations of warnings"
}
```

### DELEGATE  (from the "Area Delegates" list in Conference Members)
```json
{"area": 1, "area_name": "Alabama/Northwest Florida", "panel": 75, "name": "Luke B.", "city": "Dothan, AL", "status": "delegate"}
```
- `area` integer 1-93. `panel` = panel number printed (second-year panel = year-1951, first-year = year-1950).
- `status`: "delegate" normally; "alternate" if the area was represented by its alternate delegate (say so in notes);
  "vacant" if no one attended (name "").
- One entry per area.

### CONF_COMMITTEE  (from "<year> Conference Committees")
```json
{"committee": "AGENDA", "printed_name": "Agenda", "secondary": false, "secretary": "Rainer L.",
 "members": [ {"name": "Rudy M.", "area": 93, "panel": 75, "role": "member"},
              {"name": "Stacy S.", "area": 4,  "panel": 75, "role": "chair"},
              {"name": "Jessie W.", "area": 52, "panel": 75, "role": "alt_chair"} ]}
```
- `committee` canonical id, one of:
  `AGENDA, ARCHIVES, CPC, CORRECTIONS, FINANCE, GRAPEVINE, ICRF, LITERATURE, POLICY, PI, REPORT, TREATMENT, TRUSTEES,
   SPECIAL_NEEDS, OTHER`
  (GRAPEVINE = Grapevine / Grapevine and La Viña; ICRF = International Conventions/Regional Forums;
   POLICY = Policy/Admissions; PI = Public Information; REPORT = Report and Charter;
   TREATMENT = Treatment Facilities / Treatment and Special Needs-Accessibilities / Treatment and Accessibilities;
   SPECIAL_NEEDS = a separate Special Needs/Accessibilities committee if one existed that year; OTHER = anything else — explain in notes).
- `secondary` true when the report marks members as serving on it as a SECOND committee assignment (¹ / † footnote).
- `role`: "chair" (*), "alt_chair" (**), "member". Exactly one chair and one alt_chair per committee when marked.
- `panel` from the PANEL heading the member is listed under (or the delegate list if no headings).
- Include trustees/directors only if the report lists them inside the Conference committee roster (rare) — then use
  `"area": null, "panel": null, "role": "member"` and say so in notes.

### NEXT_CHAIR  (from "<year+1> Conference Chairpersons and Alternate Chairpersons")
```json
{"committee": "AGENDA", "chair": {"name": "Alex L.", "area": 43}, "alternate": {"name": "Heather N.", "area": 18}}
```

### TRUSTEES_COMMITTEE  (from "<year> Trustees' Committees")
```json
{"committee": "Conference", "slug": "conference", "secondary": false,
 "members": [ {"name": "Kerry M.", "type": "chair"}, {"name": "Charlie H.", "type": "member"},
              {"name": "Gerry C.", "type": "appointed"}, {"name": "Chris C.", "type": "consultant"} ],
 "secretary": "Rainer L."}
```
- slug: lowercase-hyphen of the printed name (archives, audit, compensation, conference, cpc-treatment-accessibilities,
  corrections, finance-budgetary, international, icrf, literature, nominating, public-information, gsb-sharing-session, ...).
- `type`: chair | member | appointed (Appointed Committee Member, **) | consultant (***).

### TRUSTEE
```json
{"name": "Charlie H.", "class": "B", "position": "West Central regional trustee",
 "position_id": "REG_WEST_CENTRAL", "city": "Lincoln, NE", "elected_year": 2024, "rotating": false,
 "past_delegate": {"panel": 56, "area": 41}, "board_roles": ["AAWS director"],
 "trustee_committees": ["Corrections (chair)", "Literature", "Conference"]}
```
- `class`: "A" (nonalcoholic) or "B" (alcoholic).
- `position_id` one of: CLASS_A, REG_EAST_CENTRAL, REG_NORTHEAST, REG_SOUTHEAST, REG_WEST_CENTRAL, REG_SOUTHWEST,
  REG_PACIFIC, REG_EASTERN_CANADA, REG_WESTERN_CANADA, TAL_US, TAL_CANADA, GST (general service trustee), OTHER.
  (GSB_CHAIR is assigned at build time to a Class B chair; DIR_AAWS / DIR_GRAPEVINE are used in newly_elected.)
- `rotating` true when marked "*Rotating at the close of the <year> Conference".
- `elected_year` from "was elected ... in April 2024" (null if not stated). `past_delegate` null if not a past delegate.
- `board_roles`: e.g. "GSB chair", "GSB treasurer", "AAWS chair", "Grapevine chair", "AAWS director", "Grapevine director".

### DIRECTOR  (nontrustee directors)
```json
{"name": "Julie C.", "board": "AAWS", "city": "Chester, CA", "elected_year": 2025, "rotating": false,
 "past_delegate": {"panel": 71, "area": 42}, "trustee_committees": ["ICRF", "Corrections", "Finance and Budgetary"]}
```

### NEW  (elected by the GSB following this Conference)
```json
{"name": "Candice C.", "position": "Pacific regional trustee", "position_id": "REG_PACIFIC", "class": "B",
 "city": "Pocatello, ID", "past_delegate": {"panel": 72, "area": 18}}
```
For new nontrustee directors use position "AAWS nontrustee director" / "AA Grapevine nontrustee director", position_id "DIR_AAWS" / "DIR_GRAPEVINE".

### Optional / later fields (validated when present)
- DELEGATE `status: "alternate"` + `elected_delegate`: the person printed/seated (`name`) attended for the elected
  delegate. 2022 files use the older `alternate_seated` form; `build_data.py` normalises it to this one
  (`name` = attendee, `elected_delegate`, `printed_name` = what the list printed, `elected_delegate_city`).
  `status_inferred: true` when the report does not say it outright.
- TRUSTEE / DIRECTOR `served_thru`: e.g. `"Jan. 2023"` — left the seat mid-term (resignation); ends the seat that year.
- NEW `board` (`"AAWS"` / `"Grapevine"`) and `succeeds` for general service trustees and directors.
- `conference_chair` {name, area}: delegate chair of THIS Conference. `next_conference_chair` {name, area}: the one
  chosen at this Conference for the next (derived at build time from next year's `conference_chair` when absent).
  `next_conference_alt_chair` {name, area}: printed only in 2017 and 2018 (and 2009).
- `general_manager`, `staff_director`: strings, first name + last initial.

## Build-time derivations (tools/build_data.py — the year files are never edited)
1. `normalize_delegates` — one convention for seated alternates (above).
2. `apply_chair_seat` — a Class B GSB chair gets `position_id: "GSB_CHAIR"` and
   `seat_since = (first report printing them as Chair) - 1`, because the officers printed in report Y are the slate
   elected at the annual meeting after Conference Y-1 (41 of 45 officer slots 2018-2026). Adds `prior_position(_id)`.
3. corrections (below), then `fill_past_delegates` — a missing `past_delegate.area` (or a missing record) is copied
   from another year's record of the same person with the same panel (`area_from_year` marks the copy).
4. `derive_next_chairs` — `next_conference_chair` of Y from `conference_chair` of Y+1 (`derived_from: Y+1`).
5. `--check`: every correction must match something and carry a source, every name in corrections aliases /
   board.json / conferences.json must be "First L.", then `validate_year.py` runs on every year file. Must print
   0 ERRORS everywhere.

## data/src/corrections.json — sourced fixes (one object per fix; `source` is REQUIRED)
Cite the report as `YYYY FR p.N Lnnnn` (p = PDF page = the `=====PAGE N=====` marker of the text extract; the printed
page is usually N-1) and quote the words that justify the change (names reduced to "First L."). Mark guesses
`"inferred": true` / `area_inferred: true`. Year ops take `"year": Y` or `"years": [Y, ...]`.

| op | fields | effect |
|---|---|---|
| `append` | `path`, `value` | add `value` to list `path` (e.g. `newly_elected`); replaces a same-name entry whose position is the same/unknown/OTHER |
| `patch_person` | `path`, `name`, `set`, optional `match` {field: value} | `Object.assign` `set` onto every entry of list `path` with that name (normalised exact match) |
| `set_field` | `field`, `value` | set a top-level year field (e.g. `next_conference_chair`, `general_manager`) |
| `set_delegate` | `area`, `set` | patch the delegates entry of an area (status, elected_delegate, note, ...) |
| `set_role` | `committee`, `area`, `role`, optional `inferred` | set a Conference committee member's role (chair/alt_chair) |
| `past_delegate` | `name`, `value` {panel, area, area_inferred?}, optional `years` | set past_delegate on every trustees / nontrustee_directors / newly_elected record of that person (same panel or none) in all (or the listed) years |
| `alias` | `names` [canonical, variants...], optional `kinds` [board, staff, delegate] | year-less: the names are one person (surname change, nickname, misprint). Exported as `FCR_DATA.aliases`; makes `FCR.sameName` true across the group. `FCR.personGroups` shows the canonical spelling as the person's name, except that an alias whose `kinds` omit `delegate` never renames a delegate-only person (the Panel 70 Area 7 delegate "Tom A." stays "Tom A.", not the trustee alias "Thomas L. A.") |
| `distinct_people` | `name`, `people` [{key, label, match {kinds?, area?, panel?}, default?}] | year-less: one printed name, different people. `FCR.personGroups` sends matching index entries to `key`; the `default` person takes unmatched entries that are not another delegate term |

## data/src/board.json — board facts not in the rosters (hand-checked, see `meta`)
- `annual_meetings[]` {year, date 'YYYY-MM-DD' (or 'YYYY-MM'), approx, printed, ref}
- `slates[]` — what Conference Y presented for the annual meeting right after it: {conference_year, meeting_date,
  date_approx?, printed_date?, ref, gsb_trustees {A:[{name, nonalcoholic?}], B:[...], vacancies?, counts},
  gsb_officers [{title (Chair | First Vice-Chair | Second Vice-Chair | Treasurer | Secretary | Assistant Treasurer |
  Assistant Secretary), name, third_legacy?, employee?}], aaws_directors [{name, employee?, nonalcoholic?}],
  grapevine_directors [...], notes}
- `board_assignments[]` {year, person, board 'AAWS'|'Grapevine', role trustee_director | nontrustee_director |
  general_service_trustee | class_a_director, term_years?, succeeds?, ref} — the trustees' Nominating Committee moves
- `gsb_chairs[]` {name, class, from, to, chair_since?, interim?, extra_seat?, served_thru?, note, ref}
- `trustees_emeriti` {all:[names], attending:[{year, names, note?, ref}], notes:[{year, text, ref}]}
- `general_managers[]` {name, from, to, interim?, seen?, note, ref}; `staff_services_directors[]` {name, years, title,
  note?, ref}; `staff_coordinators` {list:[{name, years, note?, ref}], note}; `conference_coordinators[]` {name, years,
  from?, note?, ref}; `desk_rotations` {events:[{when, text, ref}], note}
- `rotation_schedules[]` {source_year, ref, by_year:{YYYY:{total, class_a?, regional?, regions?, tal?, gst?, chair?,
  note?}}} — the official trustees' Nominating Committee tables (a check on `FCR.openings`)
- `seat_rules` {REG | TAL_US | TAL_CANADA | GST | CLASS_A | GSB_CHAIR | DIR_AAWS | DIR_GRAPEVINE: {label, term,
  nominated_by, deadline {month_day?, text, fixed}|null, next_elections?, pattern?, ref}}
- `patterns[]` {id, text, ref} — display-only regularities (treasurer is Class A, board-chair alternation, ...)

## data/src/conferences.json — Conference-level facts (hand-checked, see `meta`)
- `years{YYYY}` {year, ordinal, theme, start, end ('YYYY-MM-DD'), venue, format 'in person'|'virtual',
  members {total, delegates?, board?, staff?, ref}, agenda_items {n, approx, note?, ref}|null,
  advisory_actions {n, counted|stated, note?, ref}, floor_actions {passed?, not_resulting?, declined?, recommitted?,
  total?, stated?, note?, ref?}, keynote {name, role, rotating, ref}, workshop, headlines [{text, ref}],
  next {theme, workshop, topics[], ref} (what this Conference chose for the next one), refs[], delegate_chair? (2017)}
- `future[]` {ordinal, year, start, end, venue, theme?, workshop?, topics?, delegate_chair?, status
  final|preference, options? [{start, end, preference}], note?, refs}
- `regional_forums` {rule {text, odd[], even[], refs}, list [{year, region, kind? additional|local|special|virtual,
  start?, end?, month?, city, area?, status held|scheduled|cancelled|virtual, attendance?, first_timers?, note?, ref}],
  attendance [{year, attendance, first_timers?, livestream?, approx?, note?, ref}]}
- `international_conventions` {pattern, list [{year, city, start?, end?, theme?, status, attendance?, note, ref}]}
- `world_meetings` {pattern, list [{type WSM|REDELA, n, year, start?, end?, month?, place, theme?, status?, note?, ref}]}
- `structure_changes[]` {when, year, text, ref}; `finance[]` {report_year, data_year, contributions, note_contrib?,
  publishing {gross_sales|gross_profit}, reserve {amount?, months, months_next_year?, projected_end_2026_months?,
  note?}, ref}; `delegate_expense_contribution[]` {from_year, amount, previous, note?, ref}
- `delegate_chairs[]` {conference_year, ordinal, name, area, region, country, alternate? {name, area, region,
  country}, chosen_at, source}; `delegate_chair_rules` {text, refs}
- `area_contributions` {note, cols [active_groups, groups_contributed, pct_contributed, total, average],
  years{calendar year} {report_year, ref, total [cols], rows {area: [cols]}, other_rows {label: [cols]}}}
  — parsed from the report tables (scripts in the D1 scratch folder); the 93 rows plus other_rows add up to `total`.
- `final_report_print`, `misprints[]` {ref, text} (report errors the app must not copy)

## data/src/advisory_actions.json — index of M-39 (written by tools/dev/m39_merge.py; read as FCR.RAW.advisoryActions)
- `source` {title, item 'M-39', edition, pages, years [first, last], public_url, drive_url, note}
- `sections[]` {sid (order in the booklet), name, committee (FCR.COMMITTEES id or null), kind committee|historical|general,
  page (first page)}
- `actions[]` {id 'p<n>' (n = first paragraph number of the pre-segmented M-39 text; unique, stable across re-merges,
  referred to by followups.json outcomes, e.g. 'p1110'), year, sec (sid), page (M-39 PDF page), text (own-words summary, ≤ 34 words — never the
  original wording: the repo is public and M-39 is © AAWS), floor? true (floor action), noaction? true (recorded in
  M-39 but the proposal itself was not adopted: no action, tabled, deferred, referred or sent back, vote short), cross? (the committee or meeting tag M-39
  prints after the item, normalized; most such items are listed in that committee's section too), tags? [AA_TAGS in
  build_data.py], due? [{year, month? 1-12, during? true (some time in that year, not at its Conference),
  what}] (a later checkpoint the action itself set; one at the very Conference that set it needs a month or during)}
- Build: `--check` errors on missing/duplicate ids, unknown sections, years, pages, tags, long summaries or bad
  follow-ups; warns when a 2017–2026 yearly total (entries without a cross tag; recommitted items count, as in the Final
  Reports' lists) differs from conferences.json `advisory_actions.n`.
  Every build turns follow-ups due from the latest report year on (with followups.json's dated requests, minus those an
  outcome marks `superseded`) into generated Calendar events, never stored in calendar.json, url `#/actions/pending`:
  `aa-followups-YYYY` (due at that Conference), `aa-followups-YYYY-MM` (a stated month) or `aa-followups-YYYY-year`
  (`during` that year: Jan 1–Dec 31, approx).

## data/src/followups.json — dated requests and outcomes (hand-checked; read as FCR.RAW.followups)
- `meta` {about, sources, checked}
- `requests[]` — things the Final Reports (Conference committee reports, plus the board's, trustees' committees' and
  G.S.O. reports) dated for later that are NOT Advisory Actions: {id, from_year, ref 'FRyy pP Lx-y' (PDF page), committee (receiving Conference committee id
  or null), by (who asked), who (who delivers), kind report|draft|plan|recommitted|committed|deferred|deadline|other,
  text (own words, ≤ 34), due {year, month? | during? true} (only kind `committed` — committed to the General Service
  Board — may have no due; the page lists those under "No date set")}
- `outcomes[]` — what became of a follow-up once it fell due: {action (advisory_actions id, e.g. 'p1110') or request
  (requests id), due_year, status done|progress|not_done|superseded|unclear|update (news before it falls due), text
  (own words), ref ('FRyy pP Lx-y', several joined by '; '), next_due?}. `superseded` takes that due off the pending list
  and the Calendar (the new date is a request of its own); an outcome shows only once its report's Conference has met.
- Shown on `#/actions/pending` with the Advisory Action follow-ups; requests due from the latest report year on are
  counted in the generated Calendar events. Each new Final Report: add its dated requests, record outcomes for the
  items that fell due at that Conference.

## Study-feature data (tools/build_data.py STUDY_FILES; each optional; own words, every item page-cited)
`--check` requires a printed Service Manual `page` (or a `source`) on every item with text/cue/duty/label, caps those fields at
45 words and runs the anonymity name check.
- `data/src/quiz_gen.json` -> FCR.RAW.quizGen (view-quiz.js decks #/quiz/concepts and #/quiz/committees):
  `concepts[]` {n 1-12, title, node (Learn node), page}; `concept_cues[]` {concept, cue (no Concept number or title words), page,
  also? [other Concepts it fits: never offered as a wrong answer]}; `committee_scopes[]` {side conference|trustees, committee
  (FCR.COMMITTEES id or FCR.TRUSTEES_COMMITTEES key), duty (does not name the committee), page, also?, bank? (repeats a learn.json
  question: left out of the All / Service Manual / per-topic decks)}; `trustees_extra[]` {key, title, page} (Compliance,
  Employees' Retirement: trustees' committees not in core.js).
- `data/src/timelines.json` -> FCR.RAW.timelines (view-learn.js): `founding_chain[]` {year, label, page} (who held final authority),
  `founding[]` {year, date?, text, page, node?} (Learn node founding_era), `delegate_term[]` {id, title, when, text, page,
  calendar? (calendar.json rule id), from/to windows for the "you are here" markers} (Learn node delegate).
- `data/src/election_steps.json` -> FCR.RAW.electionSteps (views3.js V.timeline, Openings): `regional_trustee[]` {id, title, text,
  page, when (how the step is dated: year before / month-day / Conference / annual meeting; approx?), more? (details)}, `regional_trustee_notes[]`.
- `data/src/structure_checks.json` -> FCR.RAW.structureChecks (view-structure.js overlay, #/structure/<year>/checks):
  `levels[]` {id, short, label, node (chart box id or ids), page}, `arrows[]` {from, to, dir down|up, label, text, page}.

## data/src/panel_elects.json and areas.json — extra fields read by the views
- panel_elects `areas[]` may carry, once the December draw is announced (area newsletter / the delegate; mark
  `user_provided: true` when it comes from the user): `committee` or `panel<P>_committee` (committee id, name or
  abbreviation, e.g. "PI"), optional `secondary_committee` / `panel<P>_secondary`, `committee_source`.
  Read by `FCR.ui.announcedCommittee(n, P)` (Today, Area, Person, Delegates) and the Committees page (projected year).
- areas.json `aka[]` + `aka_source` (acronyms, printed names) and `cities[]` + `cities_source` (towns in the area that no
  delegate or trustee record names); both are indexed by the global search.

## core.js API (window.FCR) — for the views
Identity and names
- `FCR.sameName(a, b)` → bool: nickname- and alias-aware name match (not identity).
- `FCR.canonName(n)` → canonical alias spelling; `FCR.nameVariants(n)` → [all alias spellings].
- `FCR.people` → index entries `{name, names[], kind, role, desc, years[], year, lastYear, href, anchor?, area?,
  panel?, position?, board?, committee?, title?, roleType?, elected?, past?, nonAA?, chairYears?, succeeds?,
  assignmentsByYear?, userProvided?}`. Kinds (`FCR.PEOPLE_KINDS`): delegate (one per person holding a term; `names`
  = every printed variant), seated_alternate, conf_chair (roleType chair|alt_chair, committee, elected),
  delegate_chair (roleType chair|alternate), delegate_elect, alternate_elect (FCR.elects, e.g. Brandy H.), trustee
  (position, board for GST), trustee_elect / director_elect (newly elected with the new seat, succeeds), director,
  officer (title; years = annual meetings that elected them), aaws_board / grapevine_board (years = service years
  from the annual meeting; chairYears), tc_chair, acm, consultant (trustees' committees), secretary (scope
  conference|trustees, incl. non-staff such as the archivist), staff (assignmentsByYear), staff_role (title Staff
  coordinator | Conference coordinator), gvstaff, gm, staff_director, emeritus (trustees emeriti; never Class A).
- `FCR.personGroups(name)` → `[{key, name, label, roles[], ambiguous, maybeSameAs?: [keys], anchors?: [keys]}]` — the
  distinct people behind a printed name (delegate anchor area+panel, board members' past_delegate, `distinct_people`
  rules; Class A never joins a delegate; a staff/ACM/board entry with no past-delegate data never joins a delegate by
  name alone — `maybeSameAs`). Two anchored terms of the same area with adjacent years and compatible names are one
  person (`anchors` lists both): a replacement who finishes a panel and is then elected (Dwayne M., Area 82, Panel 73
  in 2024 and Panel 75), or a seated alternate later elected delegate. The label uses the latest delegate term.
- People-index trustee and director entries are keyed by seat (positionHistory slot), so a respelled name in the same
  seat is one entry ('James (Jimmy) D.' 2020–22 + 'Jimmy D.' 2023) named with the newest printed spelling; aaws_board /
  grapevine_board entries join a sameName spelling of an adjacent year. Interim-chair officer entries carry the slate
  periods they cover (Jimmy D. Jan–Apr 2023 -> 2022; Mike L. -> 2023).
- `FCR.personRoles(name, key?)` → roles of all (or one) of those people, oldest first; each role has `person` and
  `personLabel`.
- `FCR.termHolders(term)` → `[{name, names[], years[]}]` (two when a delegate was replaced mid-term).
Terms
- `FCR.term(a, p)` adds `names[]`, `attended {year: {name, status:'alternate', for, inferred}}`,
  `electedRoles {year: [{committee, role, electedAt, notServed?}]}` (every chair/alternate election),
  `delegateChair [{year, role chair|alternate, ordinal}]`. `t.name` is the elected holder (not a seated alternate);
  `t.roles` no longer copies an elected role when next year's roster prints a different holder.
Conferences and the clock
- `FCR.conference(year)` → conferences.json facts merged with the year file: `{year, ordinal, theme, start, end,
  startDate, endDate (Date), approx, datesKnown, venue, format, members, agenda_items, advisory_actions,
  floor_actions, keynote, workshop, presentations, headlines, next, delegateChair {name, area}, nextDelegateChair,
  nextAltDelegateChair, hasReport, isFuture, over, status held|final|preference|unknown, refs}`.
- `FCR.conferenceDates(year)` → `{start, end (Date), approx, known}`; `FCR.futureConferences()` → [conference(77..80)].
- `FCR.cycle(now?)` — as before plus `confOver` (true from the real closing day), `inSession`, `lastConference`,
  `nextStart`, `nextEnd`, `nextDatesKnown`, `daysToNext` (whole calendar days); `nextConference` flips on the closing
  day. `reportPending` = the last Conference held (`lastConference`) has no Final Report loaded yet; it stays true from
  January to the next Conference while last year's report is missing.
- `FCR.delegateChairs()` → `[{conference_year, ordinal, name, area, areaName, panel, region, country, alternate?,
  chosen_at, source}]` for 2009, 2010, 2017-2027.
- `FCR.areaContributions(n)` → `[{year, report_year, active_groups, groups_contributed, pct_contributed, total,
  average, ref}]` (calendar years 2022-2025).
Board
- `FCR.currentOfficers(date?)` → `{asOf, approx, conferenceYear, source 'slate'|'printed', ref, officers [{title,
  name, third_legacy?, employee?}], byTitle {Chair: ...}, trustees {A, B}, aaws [{name, employee?}], grapevine [...],
  boardChairs {aaws, grapevine: {name|null, status 'printed'|'not published', period, previous?, pattern? {type
  GST|REG, candidates[], text}}}, notes}`; `FCR.slates` = board.json slates. board.json `gsb_chairs` interim chairs
  replace the Chair of the slate period they cover (`{title: 'Interim Chair', interim: true}`) when the elected chair's
  `served_thru` month has ended or the slate prints '(vacant)'.
- `FCR.positionHistory()` (memoised) → slots `{pid, name, aliases, class, years, elected, start, end, fullEnd, term,
  isCurrent, leftEarly, rotatingYear, leftYear, servedThru, movedUpYear, movedTo, chairSince?, chairEnd?,
  firstTermEnd?, firstTermSoft?, board 'AAWS'|'Grapevine'|null, boardByYear, seat trustee|director|chair, label,
  past, city, latest, latestYear, electedAfter?, succeeds?}`. Rules: served_thru ends the seat; a Class A GSB chair
  ends with the 4-year chair term; a DIR_* slot closes when the person is elected to a trustee seat.
- `FCR.positionLabel(slot | pid)`, `FCR.seatKind(pid)` → 'trustee'|'director'|'chair'; `FCR.yearRange(years)` → '2021–2026, 2028' (runs of consecutive years); `FCR.serviceYearRange(startYears)` → '2024–26' (board-year starts as service years; used for aaws_board / grapevine_board descriptions).
- `FCR.openings(fromYear?, toYear?)` → `[{year, ordinal, seats[], counts {trustees, directors, chair, soft}}]`;
  seat `{year, pid, label, seat, board, region, holder (slot)|null, name, successorOf, generation, start, end,
  soft?, likely?, note, nominatedBy, deadline {date 'YYYY-MM-DD'|null, passed, daysLeft, text, fixed}|null}`
  (`passed` from the day after the deadline date; `daysLeft` in whole calendar days; seat_rules deadline texts are
  year-neutral, and a literal `{year}` in one is replaced by the seat's election year).
  Successors of seats whose next holder is not elected yet are chained (`holder: null`, name '(to be elected E)').
  Soft seats (not counted): Class A first-term ends and likely extra director vacancies.
- `FCR.regionalTrustee(rid)`, `FCR.boardSize(year)`, `FCR.termFor(pid)`, `FCR.regionCountry(rid)`,
  `FCR.areaRegion(n)` helpers.
Committees and their counterparts (Service Manual 2026–2028 pp. 46–48, 58–60; Appendix C p. 109)
- `FCR.COMMITTEES[id]` → `{name, short?, abbr, trustees, tc, secondaryNow?}`: `trustees` = display name of the
  corresponding trustees' committee ('' for POLICY and REPORT, which have none — p. 47); `tc` = its
  `FCR.TRUSTEES_COMMITTEES` key, `'GV_BOARD'` for GRAPEVINE (meets with the AA Grapevine board instead), or null.
  `FCR.PRIMARY_ORDER`, `FCR.cname(id)`, `FCR.cabbr(id)`.
- `FCR.TRUSTEES_COMMITTEES[key]` → `{name, short, re, cc: [Conference committee ids], auxiliary?, session?, ref?}` for CONFERENCE,
  ARCHIVES, CPCTA, CORRECTIONS, FINANCE, ICRF, LITERATURE, NOMINATING, PI, INTERNATIONAL, AUDIT, COMPENSATION, SHARING
  (`cc` empty = no Conference counterpart; `ref` = the Manual page that says so, cited on the Structure page; `session`
  marks the General Sharing Session, which the board holds each quarterly weekend and is not a committee, p. 61).
  `FCR.tcKey(printedName)` → key of a `trustees_committees[].committee`
  string ('Finance & Budgetary' → 'FINANCE', 'G.S.B. Sharing Session' → 'SHARING'), null when unknown.
