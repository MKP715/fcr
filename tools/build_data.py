"""Merge data/src/** into data/fcr-data.js (a plain script so index.html works from file:// and GitHub Pages).

Usage:  python tools/build_data.py            # build
        python tools/build_data.py --check    # build + validate every year file, corrections, board.json, conferences.json
Sources:
  data/src/years/<YEAR>.json    per-Conference rosters (schema: tools/YEAR_SCHEMA.md)
  data/src/corrections.json     sourced fixes applied at build time (ops documented in tools/YEAR_SCHEMA.md)
  data/src/areas.json           93 areas + 8 regions (tools/areas_seed.py)
  data/src/rules.json           Service Manual rules, regions, trustee schedule, reference docs (optional)
  data/src/panel_elects.json    delegate-elects found on area websites (optional)
  data/src/reports.json         Final Report library: year, theme, Drive file name/link, source (optional)
  data/src/analysis.json        committee-assignment pattern analysis + model defaults (optional)
  data/src/calendar.json        "what to expect when": recurring cycle and dated events (optional)
  data/src/conferences.json     per-Conference facts, future Conference dates, forums, conventions (optional)
  data/src/board.json           post-Conference slates, trustees emeriti, general managers (optional)
  data/src/forecast.json        precomputed committee odds for pending panels (tools/dev/precompute_forecast.js)
  data/src/learn.json           Learn tree, glossary, quiz bank, rules and service-year lines (--check: links, cites, answers)
  data/src/advisory_actions.json  index of the Conference's Advisory Actions 1951-2026 (GSO item M-39): year, section,
                                page, a summary in our own words (the original wording stays in the PDF), follow-up dates
                                (tools/dev/m39_merge.py); follow-ups due from the latest report's year on become Calendar events
  data/src/followups.json       dated requests in the Final Reports (committee, board, trustees' and G.S.O. reports) that are
                                not Advisory Actions, and what became of follow-ups once due (hand-checked; dated ones are
                                also generated Calendar events), plus dated progress news from board weekends (optional)
  data/src/pai.json             proposed agenda items of the next Conference from GSO's status grid: own-words summaries,
                                themes, related Advisory Actions, last cycle's outcomes, and what the fall board weekend
                                decided (per-item decisions, agenda topics, reasons, open meetings, cited to the board
                                packet) (the grid and packet, with the submitted wording and group names, stay in Drive)
                                (optional)
  data/src/board_meetings.json  Board Weekends: the General Service Board's quarterly weekends, newest first, with one
                                own-words card per report in the packet GSO sends Conference members, the minutes' view
                                merged in (the packet itself stays in Drive) (optional)
Derived at build time (never stored in the year files):
  * GSB_CHAIR seat for a Class B chair (seat_since = first report printing them as Chair - 1, because the officers
    printed in report Y are the slate elected at the annual meeting after Conference Y-1)
  * next_conference_chair for every year Y from conference_chair of Y+1 (unless a correction sets it)
  * past_delegate.area filled from another year's record of the same person (same name + panel)
  * delegates seated by an alternate use one convention: name = attendee, status 'alternate', elected_delegate
"""
import glob
import json
import os
import re
import subprocess
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'data', 'src')
PEOPLE_PATHS = ('trustees', 'nontrustee_directors', 'newly_elected')


def load(name, default):
    p = os.path.join(SRC, name)
    if not os.path.exists(p):
        return default
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def norm(n):
    return re.sub(r'\s+', ' ', re.sub(r'\(.*?\)|[^a-zà-ÿ ]', ' ', (n or '').lower())).strip()


def name_parts(n):
    """Mirror of FCR.nameParts: first names (incl. a nickname in parentheses) and the last initial."""
    n = str(n or '')
    nick = re.findall(r'\(([^)]+)\)', n)
    toks = re.sub(r'\(.*?\)', ' ', n).split()
    toks = [t for t in toks if t.lower().strip('.') not in ('hon', 'sr', 'sister')] or toks
    last = re.sub(r'[^A-Za-zÀ-ÿ]', '', toks[-1])[:1].lower() if len(toks) > 1 else ''
    firsts = {re.sub(r'[^a-zà-ÿ-]', '', x.lower()) for x in ([toks[0]] if toks else []) + nick if x}
    return firsts - {''}, last


def same_name(a, b):
    if not a or not b:
        return False
    A, B = name_parts(a), name_parts(b)
    return A[1] == B[1] and bool(A[0] & B[0])


def gsb_chair_name(d):
    for o in d.get('gsb_officers') or []:
        if (o.get('title') or '').strip().lower() in ('chair', 'chairperson', 'chairman'):
            return o.get('name')
    return None


def apply_chair_seat(years):
    """A Class B GSB chair occupies an additional (22nd) seat: give that trustee position_id GSB_CHAIR and
    seat_since = (first year of the unbroken run of reports listing them as Chair) - 1. The officers printed in
    report Y are the slate elected at the annual meeting right after Conference Y-1 (41 of 45 officer slots
    2018-2026 match the previous year's slate), so a chair first printed in 2025 took the seat in 2024."""
    ys = sorted(int(y) for y in years)
    for y in ys:
        d = years[str(y)]
        chair = gsb_chair_name(d)
        if not chair:
            continue
        for t in d.get('trustees') or []:
            roles = ' '.join(t.get('board_roles') or []).lower()
            if 'interim' in roles and norm(t.get('name')) != norm(chair):
                continue  # an interim chair keeps their own seat
            is_chair = norm(t.get('name')) == norm(chair) or 'gsb chair' in roles or 'general service board chair' in roles
            if t.get('class') == 'B' and is_chair:
                if t.get('position_id') != 'GSB_CHAIR':
                    t['prior_position'] = t.get('position')
                    t['prior_position_id'] = t.get('position_id')
                t['position_id'] = 'GSB_CHAIR'
                t['position'] = 'General Service Board chair (Class B)'
                start = y
                while str(start - 1) in years and norm(gsb_chair_name(years[str(start - 1)])) == norm(t.get('name')):
                    start -= 1
                t['seat_since'] = start - 1
                t['seat_since_rule'] = 'first report printing them as Chair minus 1'


def normalize_delegates(years):
    """One convention for a seated alternate: name = the person who attended, status 'alternate',
    elected_delegate = the elected delegate (2022 files used name = elected, alternate_seated = attendee)."""
    for y, d in years.items():
        for x in d.get('delegates') or []:
            if x.get('alternate_seated'):
                x['elected_delegate'] = x.get('name')
                x['printed_name'] = x.get('printed_name') or x.get('name')
                x['elected_delegate_city'] = x.get('city')
                x['name'] = x.pop('alternate_seated')
                x['city'] = ''
                x['status'] = 'alternate'


def apply_corrections(years, corrections):
    """Apply documented, source-cited fixes from data/src/corrections.json (extracted year files stay untouched).
    Returns (applied, misses, globals) where globals holds the year-less ops (alias, distinct_people)."""
    applied, misses = [], []
    glob_ops = {'aliases': [], 'distinct_people': []}
    for idx, c in enumerate(corrections):
        op = c.get('op')
        if not c.get('source'):
            misses.append((idx, None, op, 'no source'))
        if op == 'alias':
            glob_ops['aliases'].append({'names': c['names'], 'canonical': c.get('canonical') or c['names'][0],
                                        'kinds': c.get('kinds'), 'source': c.get('source')})
            applied.append((None, op)); continue
        if op == 'distinct_people':
            glob_ops['distinct_people'].append({'name': c['name'], 'people': c['people'], 'source': c.get('source')})
            applied.append((None, op)); continue
        if op == 'past_delegate':
            # Every record of this person (trustees / directors / newly elected) in the given years, or all years.
            ys = c.get('years') or sorted(years)
            hits = 0
            for y in ys:
                d = years.get(str(y))
                for path in PEOPLE_PATHS:
                    for t in (d or {}).get(path) or []:
                        pd = t.get('past_delegate') or {}
                        if same_name(t.get('name'), c['name']) and (not c['value'].get('panel') or not pd.get('panel') or pd.get('panel') == c['value']['panel']):
                            t['past_delegate'] = dict(pd, **c['value'])
                            t['past_delegate']['correction'] = c['source']
                            hits += 1
            (applied if hits else misses).append((idx, None, op, c['name']) if not hits else (None, op))
            continue
        for y in c.get('years') or [c.get('year')]:
            d = years.get(str(y))
            if not d:
                misses.append((idx, y, op, 'year not loaded')); continue
            hit = 0
            if op == 'append':
                # Replace a same-name entry whose position is the same, unknown or OTHER; otherwise add.
                lst = d.setdefault(c['path'], [])
                new = dict(c['value'], correction=c['source'])
                i = next((i for i, x in enumerate(lst) if norm(x.get('name')) == norm(new.get('name'))
                          and x.get('position_id') in (new.get('position_id'), None, '', 'OTHER')), None)
                if i is None:
                    lst.append(new)
                else:
                    lst[i] = new
                hit = 1
            elif op == 'patch_person':
                for t in d.get(c['path']) or []:
                    if norm(t.get('name')) == norm(c['name']) and all(t.get(k) == v for k, v in (c.get('match') or {}).items()):
                        t.update(c['set']); t['correction'] = c['source']; hit += 1
            elif op == 'set_field':
                d[c['field']] = dict(c['value'], correction=c['source']) if isinstance(c['value'], dict) else c['value']
                hit = 1
            elif op == 'set_delegate':
                for x in d.get('delegates') or []:
                    if x.get('area') == c['area']:
                        x.update(c['set']); x['correction'] = c['source']; hit += 1
            elif op == 'set_role':
                for cc in d.get('conference_committees') or []:
                    if cc.get('committee') == c['committee']:
                        for m in cc.get('members') or []:
                            if m.get('area') == c['area']:
                                m['role'] = c['role']
                                if c.get('inferred'):
                                    m['inferred'] = True
                                m['correction'] = c['source']; hit += 1
            else:
                misses.append((idx, y, op, 'unknown op')); continue
            (applied.append((y, op)) if hit else misses.append((idx, y, op, c.get('name') or c.get('field') or c.get('area'))))
    return applied, misses, glob_ops


def fill_past_delegates(years):
    """Fill a missing past_delegate.area (or the whole record) from another year's record of the same person,
    matched by name and panel (bios often state the area in some years only)."""
    recs = []
    for y in sorted(years):
        for path in PEOPLE_PATHS:
            recs += [(int(y), t) for t in years[y].get(path) or []]
    known = [(y, t) for y, t in recs if (t.get('past_delegate') or {}).get('area') and (t.get('past_delegate') or {}).get('panel')]
    n = 0
    for y, t in recs:
        pd = t.get('past_delegate')
        if pd and pd.get('area'):
            continue
        for y2, k in known:
            kp = k['past_delegate']
            if same_name(t.get('name'), k.get('name')) and (not pd or not pd.get('panel') or pd.get('panel') == kp['panel']) \
                    and (pd or t.get('position_id') == k.get('position_id') or t.get('board') == k.get('board')):
                t['past_delegate'] = dict(pd or {}, panel=kp['panel'], area=kp['area'], area_from_year=y2)
                if kp.get('area_inferred'):
                    t['past_delegate']['area_inferred'] = True
                n += 1
                break
    return n


def derive_next_chairs(years):
    """next_conference_chair of year Y = conference_chair of Y+1 (the delegate chair chosen at Conference Y)."""
    n = 0
    for y in sorted(years):
        d, nxt = years[y], years.get(str(int(y) + 1))
        if not d.get('next_conference_chair') and nxt and nxt.get('conference_chair'):
            d['next_conference_chair'] = dict(nxt['conference_chair'], derived_from=int(y) + 1)
            n += 1
    return n


def check_names(label, obj, errs):
    """Anonymity check for the hand-written data files: every 'name'-like string must be 'First L.'."""
    sys.path.insert(0, os.path.join(ROOT, 'tools'))
    from validate_year import name_ok
    keys = ('name', 'names', 'holder', 'succeeds', 'person', 'chair', 'alternate', 'keynote_name', 'elected_delegate')

    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in keys and isinstance(v, str) and v and not v.startswith('(') and not name_ok(v):
                    errs.append(f'{label}: name format {path}.{k} = {v!r}')
                elif k in keys and isinstance(v, list):
                    for i, s in enumerate(v):
                        if isinstance(s, str) and s and not s.startswith('(') and not name_ok(s):
                            errs.append(f'{label}: name format {path}.{k}[{i}] = {s!r}')
                walk(v, path + '.' + k)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f'{path}[{i}]')
    walk(obj, label)


def check_reports(reports):
    """Final Report library: one entry per year, each linking one Drive file (not the folder), named
    '<year> - <Nth> GSC Final Report[ - <theme or venue>] (<edition>).pdf', with ISO dates when given."""
    errs, seen = [], set()
    for r in reports:
        y = r.get('year')
        if y in seen:
            errs.append(f'reports.json: two entries for {y} (list a second copy under "alternates")')
        seen.add(y)
        for c in [r] + (r.get('alternates') or []):
            url, name = c.get('drive_url') or '', (c.get('file_name') or '').split('/')[-1]
            if not re.match(r'https://drive\.google\.com/file/d/[\w-]+/view$', url):
                errs.append(f'reports.json {y}: drive_url is not a Drive file link: {url!r}')
            if not re.match(rf'{y} - {r.get("ordinal")}(st|nd|rd|th) GSC Final Report( - .+)? \(.+\)\.pdf$', name):
                errs.append(f'reports.json {y}: file name does not follow the library pattern: {name!r}')
        if r.get('ordinal') != (y or 0) - 1950:
            errs.append(f'reports.json {y}: ordinal {r.get("ordinal")} should be {(y or 0) - 1950}')
        for k in ('start', 'end'):
            if r.get(k) and not (re.match(r'\d{4}-\d\d-\d\d$', r[k]) and r[k].startswith(str(y))):
                errs.append(f'reports.json {y}: {k} {r[k]!r} is not an ISO date in {y}')
    return errs


AA_TAGS = set('literature big-book pamphlets grapevine la-vina finance contributions prices conference agenda committees '
              'delegates areas regions trustees nominations board gso convention forums public-information media anonymity cpc '
              'corrections treatment accessibilities archives service-manual charter final-report traditions concepts steps '
              'technology translation international al-anon clubs directories films groups wsm other'.split())


def check_advisory_actions(aa, conferences, years):
    """advisory_actions.json: every action has a unique id 'p<n>', a known section, a year 1951-latest, a page 1..pages, a
    short own-words summary (no full text: the repo is public; the original wording stays in the PDF) and well-formed
    follow-ups. Per-year totals (entries without a cross tag) are compared with conferences.json advisory_actions counts;
    the Final Reports' lists include motions that sent an item back (recommitted), which the index marks noaction."""
    errs, warn = [], []
    if not aa:
        return errs, warn
    src = aa.get('source') or {}
    sids = {s['sid'] for s in aa.get('sections', [])}
    last, pages = max(int(y) for y in years) if years else 2100, int(src.get('pages') or 999)
    seen = set()
    for i, a in enumerate(aa.get('actions', [])):
        tag = f"advisory action {a.get('id', i)}"
        aid = a.get('id')
        if not isinstance(aid, str) or not re.match(r'p\d+$', aid) or aid in seen: errs.append(f'{tag}: missing, malformed or duplicate id {aid!r}')
        seen.add(aid)
        if a.get('sec') not in sids: errs.append(f'{tag}: unknown section {a.get("sec")}')
        if not isinstance(a.get('year'), int) or not 1951 <= a['year'] <= last: errs.append(f'{tag}: year {a.get("year")}')
        if not isinstance(a.get('page'), int) or not 1 <= a['page'] <= pages: errs.append(f'{tag}: page {a.get("page")}')
        t = a.get('text') if isinstance(a.get('text'), str) else ''
        if not t or len(t.split()) > 34: errs.append(f'{tag}: summary missing or longer than 34 words')
        for k in a.get('tags') or []:
            if k not in AA_TAGS: errs.append(f'{tag}: unknown tag {k}')
        for k in ('floor', 'noaction'):
            if k in a and a[k] is not True: errs.append(f'{tag}: {k} must be true or absent')
        dues = a.get('due')
        if dues is not None and not isinstance(dues, list): errs.append(f'{tag}: due must be a list of follow-up objects'); dues = []
        for d in dues or []:
            if not isinstance(d, dict): errs.append(f'{tag}: follow-up must be an object'); continue
            if not isinstance(d.get('year'), int) or d['year'] > 2100 or (isinstance(a.get('year'), int) and d['year'] < a['year']): errs.append(f'{tag}: follow-up year {d.get("year")}')
            if not isinstance(d.get('what'), str) or not d['what'].strip(): errs.append(f'{tag}: follow-up without text')
            if 'month' in d and d['month'] not in range(1, 13): errs.append(f'{tag}: follow-up month {d["month"]}')
            if 'during' in d and (d['during'] is not True or 'month' in d): errs.append(f'{tag}: during must be true and without a month')
            if d.get('year') == a.get('year') and not d.get('month') and not d.get('during'):
                errs.append(f'{tag}: follow-up due at the Conference that set it (give a month, or during: true)')
    printed = {int(y): (c.get('advisory_actions') or {}) for y, c in (conferences.get('years') or {}).items()}
    for y, c in sorted(printed.items()):
        n = c.get('n') if isinstance(c, dict) else c
        if isinstance(n, int):
            got = sum(1 for a in aa.get('actions', []) if a.get('year') == y and not a.get('cross'))
            if got != n: warn.append(f'advisory actions {y}: M-39 index has {got}, conferences.json says {n}')
    return errs, warn


FU_KINDS = {'report', 'draft', 'plan', 'recommitted', 'committed', 'deferred', 'deadline', 'other'}
FU_STATUS = {'done', 'progress', 'not_done', 'superseded', 'unclear', 'update'}  # update: news before it falls due
COMMITTEE_IDS = {'AGENDA', 'ARCHIVES', 'CPC', 'CORRECTIONS', 'FINANCE', 'GRAPEVINE', 'ICRF', 'LITERATURE', 'POLICY', 'PI',
                 'REPORT', 'TREATMENT', 'TRUSTEES'}
FU_PROGRESS_STATUS = {'done', 'progress', 'update'}
# progress cites: a board weekend's board & committee reports ('Q4 2026 board reports p. 36', PDF page) or a PAI status grid
FU_CITE = re.compile(r'(?:(Q[1-4] \d{4} board reports)|([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) PAI status grid) p\. (\d+)$')


def board_packets(bm, pai):
    """The board-weekend packets the data may cite: short cite ('Q4 2026 board reports') -> {pages, start, end}, from
    board_meetings.json meetings[].source and pai.json decisions_source (its weekend_start..weekend_end)."""
    packets = {}
    for m in (bm or {}).get('meetings') or []:
        s = m.get('source') or {}
        if s.get('short'): packets[s['short']] = {'pages': s.get('pages'), 'start': m.get('start'), 'end': m.get('end')}
    ds = (pai or {}).get('decisions_source') or {}
    if ds.get('short'): packets.setdefault(ds['short'], {'pages': ds.get('pages'), 'start': ds.get('weekend_start'), 'end': ds.get('weekend_end')})
    return packets


def check_progress(tag, p, pai, packets=None):
    """One dated progress note on a follow-up ({date, status?, text, cite, also?}): ISO date, own-words text <= 45 words,
    cite FU_CITE with pages inside the document (that packet's pages, from packets = board_packets(); the grid of that
    date, pai.json source or previous_grid, for a grid), also = more pages of the same document."""
    import datetime as dt
    errs = []
    if not isinstance(p, dict): return [f'{tag}: progress note must be an object']
    if not bm_date(p.get('date')): errs.append(f'{tag}: date {p.get("date")!r} must be YYYY-MM-DD')
    if 'status' in p and p['status'] not in FU_PROGRESS_STATUS: errs.append(f'{tag}: status {p["status"]}')
    t = p.get('text') if isinstance(p.get('text'), str) else ''
    if not t or len(t.split()) > 45: errs.append(f'{tag}: text missing or longer than 45 words')
    m = FU_CITE.match(p.get('cite') or '')
    if not m: errs.append(f'{tag}: cite {p.get("cite")!r} must be "Q4 2026 board reports p. N" or "Nov 6, 2026 PAI status grid p. N"'); return errs
    pai, packets = pai or {}, packets if packets is not None else board_packets(None, pai)
    if m.group(1):   # a board weekend's packet: bound by its page count
        pk = packets.get(m.group(1))
        if pk is None: errs.append(f'{tag}: cite {p["cite"]!r} names no known packet (board_meetings.json source.short)')
        top = (pk or {}).get('pages')
    else:   # a grid: bound by the page count of the grid of that date, when pai.json has it
        try: iso = dt.datetime.strptime(f'{m.group(2)} {m.group(3)} {m.group(4)}', '%b %d %Y').date().isoformat()
        except ValueError: iso = None; errs.append(f'{tag}: cite date {p["cite"]!r}')
        g = next((g for g in (pai.get('source') or {}, pai.get('previous_grid') or {}) if g.get('as_of') == iso), {})
        top = g.get('pages')
    if 'also' in p and not isinstance(p['also'], list): errs.append(f'{tag}: also must be a list of page numbers')
    for n in [int(m.group(5))] + (p['also'] if isinstance(p.get('also'), list) else []):
        if not isinstance(n, int) or isinstance(n, bool) or n < 1 or (isinstance(top, int) and n > top): errs.append(f'{tag}: page {n!r} outside 1..{top or "?"}')
    return errs


def check_followups(fu, aa, pai=None, packets=None):
    """followups.json: requests in the Final Reports (committee, board, trustees' and G.S.O. reports) that are dated for
    later and are not Advisory Actions (only kind 'committed' may have no date), and what became of a follow-up once it
    fell due. Own-words text only; request refs 'FRyy pP Lx-y', outcome refs may list several 'FRyy pP …; pQ …'.
    Dated news before a follow-up falls due: requests[].progress[] and action_progress[] {action (an Advisory Action with
    a follow-up), date, status?, text, cite, also?}, each checked by check_progress."""
    errs = []
    if not fu:
        return errs
    ids = set()
    for i, r in enumerate(fu.get('requests', [])):
        tag = f"followups.json request {r.get('id', i)}"
        if not r.get('id') or r['id'] in ids: errs.append(f'{tag}: missing or duplicate id')
        ids.add(r.get('id'))
        y = r.get('from_year')
        if not isinstance(y, int) or not 2017 <= y <= 2100: errs.append(f'{tag}: from_year {y}')
        if not re.match(r'FR\d\d p\d+( L\d+(-\d+)?)?$', r.get('ref') or '') or (isinstance(y, int) and r['ref'][2:4] != str(y)[2:]):
            errs.append(f'{tag}: ref {r.get("ref")!r} must be "FR{str(y)[2:]} p<PDF page> L<lines>"')
        if r.get('committee') is not None and r['committee'] not in COMMITTEE_IDS: errs.append(f'{tag}: committee {r["committee"]}')
        if r.get('kind') not in FU_KINDS: errs.append(f'{tag}: kind {r.get("kind")}')
        t = r.get('text') if isinstance(r.get('text'), str) else ''
        if not t or len(t.split()) > 34: errs.append(f'{tag}: text missing or longer than 34 words')
        if 'progress' in r and not isinstance(r['progress'], list): errs.append(f'{tag}: progress must be a list')
        for j, p in enumerate(r.get('progress') if isinstance(r.get('progress'), list) else []):
            errs += check_progress(f'{tag} progress[{j}]', p, pai, packets)
        if 'due' not in r and r.get('kind') == 'committed':
            continue  # committed to the General Service Board: the report sets no date
        d = r.get('due')
        if not isinstance(d, dict): errs.append(f'{tag}: due must be an object {{"year": …}}'); continue
        if not isinstance(d.get('year'), int) or d['year'] > 2100 or (isinstance(y, int) and d['year'] < y): errs.append(f'{tag}: due year {d.get("year")}')
        if 'month' in d and d['month'] not in range(1, 13): errs.append(f'{tag}: due month {d["month"]}')
        if 'during' in d and (d['during'] is not True or 'month' in d): errs.append(f'{tag}: during must be true and without a month')
        if isinstance(y, int) and d.get('year') == y and not d.get('month') and not d.get('during'):
            errs.append(f'{tag}: due at the Conference that set it (give a month, or during: true)')
    acts = {a.get('id'): a for a in (aa or {}).get('actions', []) if a.get('id')}
    reqs = {r.get('id'): r for r in fu.get('requests', [])}
    for i, o in enumerate(fu.get('outcomes', [])):
        tag = f"followups.json outcome {o.get('action') or o.get('request') or i}"
        if o.get('request'):
            r = reqs.get(o['request'])
            if not r: errs.append(f'{tag}: no such request'); continue
            rd = r.get('due') if isinstance(r.get('due'), dict) else {}
            if rd.get('year') != o.get('due_year'): errs.append(f'{tag}: the request is not due {o.get("due_year")}')
        else:
            a = acts.get(o.get('action'))
            if not a: errs.append(f'{tag}: no such Advisory Action'); continue
            dues = a.get('due') if isinstance(a.get('due'), list) else []
            if not any(isinstance(d, dict) and d.get('year') == o.get('due_year') for d in dues): errs.append(f'{tag}: the action has no follow-up due {o.get("due_year")}')
        if o.get('status') not in FU_STATUS: errs.append(f'{tag}: status {o.get("status")}')
        if not isinstance(o.get('text'), str) or not o['text'] or len(o['text'].split()) > 34: errs.append(f'{tag}: text missing or longer than 34 words')
        if not re.match(r'FR\d\d p\d+', o.get('ref') or ''): errs.append(f'{tag}: ref {o.get("ref")!r}')
    for i, p in enumerate(fu.get('action_progress') or []):
        tag = f"followups.json action_progress {(p.get('action') if isinstance(p, dict) else None) or i}"
        a = acts.get(p.get('action')) if isinstance(p, dict) else None
        if not a: errs.append(f'{tag}: no such Advisory Action'); continue
        if not (a.get('due') if isinstance(a.get('due'), list) else []): errs.append(f'{tag}: the action has no follow-up')
        errs += check_progress(tag, p, pai, packets)
    return errs


TC_IDS = {'CONFERENCE', 'ARCHIVES', 'CPCTA', 'CORRECTIONS', 'FINANCE', 'ICRF', 'LITERATURE', 'NOMINATING', 'PI',   # FCR.TRUSTEES_COMMITTEES
           'INTERNATIONAL', 'AUDIT', 'COMPENSATION', 'SHARING'}
PAI_STATUS = {'under', 'withdrawn', 'superseded', 'removed', 'deferred',
              'forwarded', 'forwarded_topic', 'no_action'}   # the grid after a board weekend: decided items
PAI_DECIDED = {'forwarded', 'forwarded_topic', 'no_action'}
PAI_ACTIONS = {'forwarded', 'forwarded_topic', 'no_action', 'referred', 'deferred', 'pending'}
PAI_OPEN_ACTIONS = {'referred', 'deferred', 'pending'}      # still 'under' consideration after the weekend
PAI_TOPIC_KINDS = {'item', 'general_topic', 'added', 'reference'}   # reference = a note, not an agenda entry
PAI_SNAP_KEYS = {'under', 'out', 'deferred', 'forwarded', 'forwarded_topic', 'no_action'}
PAI_CITE = re.compile(r'(Q[1-4] \d{4} board reports) p\. (\d+)$')   # a PDF page of a board weekend's packet
PAI_GRID_CITE = re.compile(r'[A-Z][a-z]{2} \d{1,2}, \d{4} grid p\. (\d+)$')
PAI_KINDS = {'group', 'district', 'area', 'committee', 'individual', 'unstated'}
PAI_NEEDS = ('title', 'asks', 'themes', 'targets', 'submitter', 'language')   # every item that has a summary
# Privacy: a group's service number (#123456, or any 6+ digit run), an e-mail address, a phone number
PAI_PRIVATE = [(re.compile(r'#\s*\d{5,}|\b\d{6,}\b'), 'a group service number'), (re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+'), 'an e-mail address'),
               (re.compile(r'\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b'), 'a phone number')]


PAI_FCR_ORDER = ['AGENDA', 'CPC', 'CORRECTIONS', 'FINANCE', 'GRAPEVINE', 'LITERATURE', 'POLICY', 'PI', 'REPORT', 'TREATMENT',
                 'TRUSTEES', 'ICRF']   # Final Report order of the Conference committees (agenda_topics are sorted by it)
PAI_SHORT_WORDS = 45   # decision reasons and notes, topic summaries, open-meeting texts: one short paragraph each


def pai_out(st):   # the grid's 'Withdrawn / Superseded' section counts as one group in snapshots
    return 'out' if st in ('withdrawn', 'superseded', 'removed') else st


def check_pai_decisions(pai, items, themes, bodies, cal=None, packets=None):
    """pai.json after a board weekend: what the trustees' committees and boards decided on each proposal.
    previous_grid = the grid before the weekend (page_oct = an item's page there); decisions_source = the board packet
    ('Q4 2026 board reports p. N', N = its PDF page; packets = board_packets(), every packet the data may cite).
    items[].decision {by, met, action, reason, to_committee?, to_provisional?, to_text?, referred_to?, topic?, cite,
    also?, reason_kind?, note?, prior? {by, action, met, cite, also?}} agrees with the item's grid status and is cited
    to a packet (met from decisions_source.weekend_start to that packet's last day) or to a grid (met up to the grid's
    as_of: an interim meeting's outcome first shows there);
    agenda_topics [{id, title, kind, by, keys, to_committee, to_provisional, to_text, summary, why, cite, also?, themes,
    related?, note?}] hold every forwarded item exactly once, sorted by Conference committee (PAI_FCR_ORDER) then size;
    open_meetings [{id, by, date, approx, date_note, keys, text, cite, also?, calendar_id?, title?}] cover every item still under
    consideration; snapshots[].counts add up to the grid's total (deferred rows of the last cycle are extra)."""
    import collections
    import datetime as dt
    errs = []
    src, pg, ds = pai.get('source') or {}, pai.get('previous_grid') or {}, pai.get('decisions_source') or {}
    words = lambda s: len(s.split()) if isinstance(s, str) else 0
    is_drive = lambda u: isinstance(u, str) and u.startswith('https://drive.google.com/file/d/')

    def iso(v, tag, what, month_ok=False):   # 'YYYY-MM-DD' only (fromisoformat also takes '20261102' or '2026-W45-1')
        if isinstance(v, str) and bm_date(v, month_ok): return v
        errs.append(f'{tag}: {what} {v!r} must be YYYY-MM-DD' + (' or YYYY-MM' if month_ok else '')); return None
    packets = packets if packets is not None else board_packets(None, pai)

    def pages(tag, cite, also, grid_ok=False):
        """A packet cite (or, where allowed, a grid cite) plus more pages of the same document. Returns the last day the
        cited document can report on (the packet's weekend end, the grid's as_of), or None."""
        m = PAI_CITE.match(cite) if isinstance(cite, str) else None
        top, last = None, None
        if m:
            pk = packets.get(m.group(1))
            if pk is None: errs.append(f'{tag}: cite {cite!r} names no known packet (board_meetings.json source.short or decisions_source.short)')
            else:
                top, last = (pk['pages'] if isinstance(pk.get('pages'), int) else None), pk.get('end')
                if top and not 1 <= int(m.group(2)) <= top: errs.append(f'{tag}: cite page {m.group(2)} outside 1..{top}')
        elif grid_ok and isinstance(cite, str) and PAI_GRID_CITE.match(cite):
            try: on = dt.datetime.strptime(cite.split(' grid ')[0], '%b %d, %Y').date().isoformat()
            except ValueError: on = None
            g = next((g for g in (src, pg) if g.get('as_of') == on), None)
            if not g: errs.append(f'{tag}: cite {cite!r} names no grid in pai.json (source / previous_grid)')
            else:
                top, last = (g['pages'] if isinstance(g.get('pages'), int) else None), g.get('as_of')
                if top and not 1 <= int(PAI_GRID_CITE.match(cite).group(1)) <= top: errs.append(f'{tag}: cite {cite!r} beyond the grid\'s {top} pages')
        else:
            errs.append(f'{tag}: cite {cite!r} must be "{ds.get("short") or "Q4 2026 board reports"} p. N"' + (' or "Nov 6, 2026 grid p. N"' if grid_ok else ''))
        if also is not None and (not isinstance(also, list) or not all(isinstance(n, int) and not isinstance(n, bool) and (not top or 1 <= n <= top) for n in also)):
            errs.append(f'{tag}: also {also!r} must list more pages 1..{top or "?"} of the cited document')
        return last
    # the two documents the decisions are read from
    if pg:
        for k in ('as_of', 'pages', 'drive_name', 'drive_url'):
            if not pg.get(k): errs.append(f'pai.json previous_grid: {k} missing')
        if iso(pg.get('as_of'), 'pai.json previous_grid', 'as_of') and src.get('as_of') and not pg['as_of'] < src['as_of']: errs.append('pai.json previous_grid: as_of must be before source.as_of')
        if pg.get('pages') is not None and (not isinstance(pg['pages'], int) or pg['pages'] < 1): errs.append(f'pai.json previous_grid: pages {pg["pages"]!r}')
        if pg.get('drive_url') and not is_drive(pg['drive_url']): errs.append('pai.json previous_grid: drive_url is not a Drive file link')
    if ds:
        for k in ('title', 'short', 'date', 'weekend_start', 'weekend_end', 'pages', 'drive_url', 'note'):
            if not ds.get(k): errs.append(f'pai.json decisions_source: {k} missing')
        d0, d1, dd = (iso(ds.get(k), 'pai.json decisions_source', k) for k in ('weekend_start', 'weekend_end', 'date'))
        if d0 and d1 and dd and not d0 <= dd <= d1: errs.append('pai.json decisions_source: date must fall within weekend_start..weekend_end')
        if dd and src.get('as_of') and not dd <= src['as_of']: errs.append('pai.json decisions_source: the grid (source.as_of) predates the decisions')
        if ds.get('pages') is not None and (not isinstance(ds['pages'], int) or ds['pages'] < 1): errs.append(f'pai.json decisions_source: pages {ds["pages"]!r}')
        if ds.get('drive_url') and not is_drive(ds['drive_url']): errs.append('pai.json decisions_source: drive_url is not a Drive file link')
    else:
        d0 = d1 = None
    kinds = pai.get('reason_kinds') or {}
    for k, v in kinds.items():
        if not isinstance(v, str) or not v: errs.append(f'pai.json reason_kinds {k}: no label')
    if pai.get('reason_kinds_about') is not None and set(pai['reason_kinds_about']) != set(kinds): errs.append('pai.json reason_kinds_about: keys differ from reason_kinds')
    # items: page in the previous grid, and one decision per decided or still-open item
    for key, it in items.items():
        tag, st, dec = f'pai.json item {key}', it.get('status'), it.get('decision')
        if pg and (not isinstance(it.get('page_oct'), int) or isinstance(it['page_oct'], bool) or not 1 <= it['page_oct'] <= (pg.get('pages') or 999)):
            errs.append(f'{tag}: page_oct {it.get("page_oct")!r} is not a page of the {pg.get("as_of")} grid')
        if st in PAI_DECIDED and not ds: errs.append(f'{tag}: status {st} but no decisions_source'); continue
        if dec is None:
            if ds and (st in PAI_DECIDED or (st == 'under' and it.get('cycle') == src.get('ordinal'))): errs.append(f'{tag}: {st} but no decision')
            continue
        if not isinstance(dec, dict): errs.append(f'{tag}: decision must be an object'); continue
        if not ds: errs.append(f'{tag}: decision but no decisions_source'); continue
        tag += ' decision'
        a = dec.get('action')
        if a not in PAI_ACTIONS: errs.append(f'{tag}: action {a!r}')
        elif (st in PAI_DECIDED and a != st) or (st == 'under' and a not in PAI_OPEN_ACTIONS):   # out / deferred rows: only when the packet discusses them
            errs.append(f'{tag}: action {a} does not match the grid status {st}')
        if dec.get('by') not in bodies: errs.append(f'{tag}: unknown body {dec.get("by")!r}')
        elif it.get('body') and dec['by'] != it['body']: errs.append(f'{tag}: by {dec["by"]} but the grid sends it to {it["body"]}')
        m = iso(dec.get('met'), tag, 'met')
        if not dec.get('reason') or words(dec.get('reason')) > PAI_SHORT_WORDS: errs.append(f'{tag}: reason missing or longer than {PAI_SHORT_WORDS} words')
        if words(dec.get('note')) > PAI_SHORT_WORDS: errs.append(f'{tag}: note longer than {PAI_SHORT_WORDS} words')
        last = pages(tag, dec.get('cite'), dec.get('also'), grid_ok=True)   # a grid cite: e.g. an interim meeting's outcome
        if m and d0 and not d0 <= m <= (last or d1 or m): errs.append(f'{tag}: met {m} is outside {d0}..{last or d1} (from the board weekend to the cited document)')
        if dec.get('to_committee') is not None and dec['to_committee'] not in COMMITTEE_IDS: errs.append(f'{tag}: unknown Conference committee {dec["to_committee"]!r}')
        if 'to_provisional' in dec and (not isinstance(dec['to_provisional'], bool) or (dec['to_provisional'] and not dec.get('to_committee'))): errs.append(f'{tag}: to_provisional must be a boolean, true only with a to_committee')
        if (dec.get('to_committee') or dec.get('to_text') or dec.get('topic')) and a not in ('forwarded', 'forwarded_topic'): errs.append(f'{tag}: to_committee / to_text / topic on a {a} decision')
        if a in ('forwarded', 'forwarded_topic') and not dec.get('topic'): errs.append(f'{tag}: {a} without a topic')
        if a == 'referred' and not dec.get('referred_to'): errs.append(f'{tag}: referred to nobody (referred_to)')
        if a == 'no_action':
            if dec.get('reason_kind') not in kinds: errs.append(f'{tag}: reason_kind {dec.get("reason_kind")!r} is not one of reason_kinds')
        elif 'reason_kind' in dec: errs.append(f'{tag}: reason_kind on a {a} decision (no_action only)')
        pr = dec.get('prior')   # the board weekend's own (open) decision, kept when a later one from another body replaced it
        if pr is not None:
            ptag = f'{tag} prior'
            if not isinstance(pr, dict): errs.append(f'{ptag}: must be an object {{by, action, met, cite}}')
            else:
                if pr.get('by') not in bodies: errs.append(f'{ptag}: unknown body {pr.get("by")!r}')
                elif pr['by'] == dec.get('by'): errs.append(f'{ptag}: same body as the decision (prior is only for a later decision by another body)')
                if pr.get('action') not in PAI_OPEN_ACTIONS: errs.append(f'{ptag}: action {pr.get("action")!r} must be one of {sorted(PAI_OPEN_ACTIONS)} (the item stayed open)')
                pm = iso(pr.get('met'), ptag, 'met')
                if pm and d0 and d1 and not d0 <= pm <= d1: errs.append(f'{ptag}: met {pm} is outside the board weekend {d0}..{d1}')
                if pm and m and not pm < m: errs.append(f'{ptag}: met {pm} must be before decision.met {m}')
                pages(ptag, pr.get('cite'), pr.get('also'))
    # agenda topics: the entries the forwarded items become
    topics, seen, last = {}, {}, None
    for i, t in enumerate(pai.get('agenda_topics') or []):
        tag = f"pai.json agenda_topic {t.get('id', i)}"
        if not t.get('id') or t['id'] in topics: errs.append(f'{tag}: missing or duplicate id'); continue
        topics[t['id']] = t
        k = t.get('kind')
        if k not in PAI_TOPIC_KINDS: errs.append(f'{tag}: kind {k!r}')
        for f in ('title', 'summary', 'to_text', 'cite'):
            if not t.get(f): errs.append(f'{tag}: {f} missing')
        for f in ('summary', 'why', 'note'):
            if words(t.get(f)) > PAI_SHORT_WORDS: errs.append(f'{tag}: {f} longer than {PAI_SHORT_WORDS} words')
        if t.get('by') not in bodies: errs.append(f'{tag}: unknown body {t.get("by")!r}')
        if t.get('to_committee') is not None and t['to_committee'] not in COMMITTEE_IDS: errs.append(f'{tag}: unknown Conference committee {t["to_committee"]!r}')
        if not isinstance(t.get('to_provisional'), bool) or (t['to_provisional'] and not t.get('to_committee')): errs.append(f'{tag}: to_provisional must be a boolean, true only with a to_committee')
        pages(tag, t.get('cite'), t.get('also'))
        ks = t.get('keys') if isinstance(t.get('keys'), list) else []
        if not isinstance(t.get('keys'), list): errs.append(f'{tag}: keys must be a list')
        if k in ('item', 'general_topic') and not ks: errs.append(f'{tag}: a {k} topic with no proposals')
        if k in ('added', 'reference') and ks: errs.append(f'{tag}: an {k} topic lists proposals (use related for a reference note)')
        for r in t.get('related') or []:
            if r not in items: errs.append(f'{tag}: related {r!r} is not an item')
        main = collections.Counter()
        for key in ks:
            it = items.get(key)
            if not it: errs.append(f'{tag}: no item {key!r}'); continue
            seen.setdefault(key, []).append(t['id'])
            dec = it.get('decision') if isinstance(it.get('decision'), dict) else {}
            want = {'item': 'forwarded', 'general_topic': 'forwarded_topic'}.get(k)
            if want and it.get('status') != want: errs.append(f'{tag}: item {key} is {it.get("status")}, not {want}')
            if dec.get('topic') != t['id']: errs.append(f'{tag}: item {key} says topic {dec.get("topic")!r}')
            for f in ('to_committee', 'to_provisional'):
                if dec.get(f, False if f == 'to_provisional' else None) != t.get(f): errs.append(f'{tag}: item {key} {f} {dec.get(f)!r} differs from the topic\'s {t.get(f)!r}')
            if (it.get('themes') or [None])[0]: main[it['themes'][0]] += 1
        th = t.get('themes') if isinstance(t.get('themes'), list) else None
        if th is None: errs.append(f'{tag}: themes must be a list')
        else:
            for x in th:
                if x not in themes: errs.append(f'{tag}: unknown theme {x!r}')
            if set(th) != set(main) or any(main[a] < main[b] for a, b in zip(th, th[1:])): errs.append(f'{tag}: themes {th} are not its items\' main themes, most common first ({dict(main)})')
        c = t.get('to_committee')
        order = (k == 'reference', PAI_FCR_ORDER.index(c) if c in PAI_FCR_ORDER else len(PAI_FCR_ORDER), -len(ks))
        if last and order < last: errs.append(f'{tag}: out of order (by Conference committee in Final Report order, then most proposals first; the reference note last)')
        last = order
    for key, it in items.items():
        if it.get('status') in ('forwarded', 'forwarded_topic') and len(seen.get(key, [])) != 1:
            errs.append(f'pai.json item {key}: forwarded, but in {len(seen.get(key, []))} agenda topics (need exactly one)')
        tp = it['decision'].get('topic') if isinstance(it.get('decision'), dict) else None
        if tp and tp not in topics: errs.append(f'pai.json item {key} decision: unknown topic {tp!r}')
    # still open after the weekend: when and where each undecided item is taken up
    oms, held = set(), collections.Counter()
    ev = {e.get('id') for e in (cal or {}).get('events') or []}
    for i, o in enumerate(pai.get('open_meetings') or []):
        tag = f"pai.json open_meeting {o.get('id', i)}"
        if not o.get('id') or o['id'] in oms: errs.append(f'{tag}: missing or duplicate id')
        oms.add(o.get('id'))
        if o.get('by') is None:   # held for the Conference itself (no trustees' body has the items)
            if any((items.get(k) or {}).get('body') for k in o.get('keys') or []): errs.append(f'{tag}: by null, but its items are sent to a body')
        elif o['by'] not in bodies: errs.append(f'{tag}: unknown body {o["by"]!r}')
        if o.get('date') is not None: iso(o['date'], tag, 'date', month_ok=True)
        elif not o.get('date_note'): errs.append(f'{tag}: no date and no date_note saying why')
        if not isinstance(o.get('approx'), bool): errs.append(f'{tag}: approx must be true or false')
        if o.get('title') is not None and (not isinstance(o['title'], str) or not o['title'].strip() or words(o['title']) > 8):
            errs.append(f'{tag}: title must be a short heading (1-8 words)')
        for f in ('text', 'date_note'):
            if f == 'text' and not o.get(f): errs.append(f'{tag}: text missing')
            if words(o.get(f)) > PAI_SHORT_WORDS: errs.append(f'{tag}: {f} longer than {PAI_SHORT_WORDS} words')
        pages(tag, o.get('cite'), o.get('also'), grid_ok=True)
        if not isinstance(o.get('keys'), list): errs.append(f'{tag}: keys must be a list')
        for key in o.get('keys') or []:
            it = items.get(key)
            if not it: errs.append(f'{tag}: no item {key!r}')
            elif it.get('status') not in ('under', 'deferred'): errs.append(f'{tag}: item {key} is {it.get("status")}, not still open')
            else: held[key] += 1
        if o.get('calendar_id') is not None and cal is not None and o['calendar_id'] not in ev: errs.append(f'{tag}: calendar_id {o["calendar_id"]!r} is not a calendar.json event')
    if ds:
        for key, it in items.items():
            if it.get('status') == 'under' and held[key] != 1: errs.append(f'pai.json item {key}: under consideration, but in {held[key]} open_meetings (need exactly one)')
    # snapshots: status counts of each grid, the latest one computed from the items
    now = collections.Counter(pai_out(it.get('status')) for it in items.values())
    prev = ''
    for i, s in enumerate(pai.get('snapshots') or []):
        tag = f"pai.json snapshot {s.get('as_of', i)}"
        a = iso(s.get('as_of'), tag, 'as_of', month_ok=True) or ''
        if a and a <= prev: errs.append(f'{tag}: snapshots must be oldest first, one per grid')
        prev = a or prev
        c = s.get('counts')
        if c is None: continue
        if not isinstance(c, dict) or any(k not in PAI_SNAP_KEYS or not isinstance(v, int) or isinstance(v, bool) or v < 0 for k, v in c.items()):
            errs.append(f'{tag}: counts {c!r} must map {sorted(PAI_SNAP_KEYS)} to whole numbers'); continue
        if isinstance(s.get('total'), int) and sum(v for k, v in c.items() if k != 'deferred') != s['total']:
            errs.append(f'{tag}: counts add up to {sum(v for k, v in c.items() if k != "deferred")} (without deferred), not the total {s["total"]}')
        if a and a == src.get('as_of') and c != {k: v for k, v in now.items() if v}:
            errs.append(f'{tag}: counts {c} differ from the items\' statuses {dict(now)}')
    # the history row of this cycle repeats the grid's figures
    fwd = sum(1 for it in items.values() if it.get('cycle') == src.get('ordinal') and it.get('status') in ('forwarded', 'forwarded_topic'))
    for c in (pai.get('history') or {}).get('counts') or []:
        if c.get('year') == src.get('conference_year'):
            if c.get('received') is not None and c['received'] != src.get('total'): errs.append(f'pai.json history {c["year"]}: received {c["received"]} but source.total is {src.get("total")}')
            if c.get('forwarded') is not None and c['forwarded'] != fwd: errs.append(f'pai.json history {c["year"]}: forwarded {c["forwarded"]} but the items show {fwd}')
    for t in themes.values():
        if words(t.get('now')) > 60: errs.append(f'pai.json theme {t.get("id")}: now longer than 60 words')
        nc = t.get('now_cite')
        pm = re.match(r'(Q[1-4] \d{4} board reports)', nc) if isinstance(nc, str) else None
        if pm:   # pages of a known packet (up to a ';' that starts another source)
            pk = packets.get(pm.group(1))
            top = pk.get('pages') if isinstance(pk, dict) and isinstance(pk.get('pages'), int) else None
            if pk is None: errs.append(f'pai.json theme {t.get("id")}: now_cite {nc!r} names no known packet')
            for n in re.findall(r'\d+', nc[pm.end():].split(';')[0]) if top else []:
                if not 1 <= int(n) <= top: errs.append(f'pai.json theme {t.get("id")}: now_cite page {n} outside 1..{top}')
    if len(pai.get('observations') or []) > 10: errs.append('pai.json observations: keep at most 10')
    return errs


def check_pai(pai, aa, learn, areas=None, cal=None, packets=None):
    """pai.json (proposed agenda items of the next Conference, from GSO's status grid): unique keys; the grid's items of
    cycle source.ordinal numbered 1..source.total (key = the number; items deferred from an earlier cycle '<year>-<n>');
    every theme, family, body, asks and Conference committee id known; every Advisory Action ('aa', 'related_aa'), Learn
    node ('learn') and area id exists; same_as / superseded_by / cluster keys point at items (same_as = identical or, with
    near: true, near-identical wording, always the original, never another copy); items with a summary carry
    the fields the page shows. The grid prints motions as submitted, so the repo keeps own-words summaries only (a quote
    of at most 15 words); no group service numbers, e-mail addresses or phone numbers anywhere.
    After a board weekend (check_pai_decisions): page_oct = the item's page in previous_grid; every decided or still-open
    item carries a 'decision' cited to the board packet (decisions_source) that agrees with its grid status; agenda_topics
    hold every forwarded item exactly once; reason_kind only on no-action decisions; open_meetings point at real items
    and Calendar events (cal = calendar.json); snapshot counts add up to the snapshot's total."""
    errs = []
    if not pai:
        return errs
    src = pai.get('source') or {}
    cyc, total, pages, as_of = src.get('ordinal'), src.get('total'), src.get('pages') or 999, src.get('as_of') or ''
    for k in ('title', 'as_of', 'total', 'conference_year', 'ordinal', 'drive_name'):
        if not src.get(k): errs.append(f'pai.json source: {k} missing')
    for k in ('drive_url', 'spanish_url'):
        if src.get(k) is not None and not str(src[k]).startswith('https://drive.google.com/file/d/'): errs.append(f'pai.json source: {k} is not a Drive file link')
    if isinstance(cyc, int) and src.get('conference_year') != cyc + 1950: errs.append(f'pai.json source: conference_year {src.get("conference_year")} is not the {cyc}th Conference')
    fams = {f.get('id') for f in pai.get('families') or []}
    bodies = pai.get('bodies') or {}
    asks = pai.get('asks') or {}
    for k, b in bodies.items():
        if not (b or {}).get('name'): errs.append(f'pai.json body {k}: no name')
        if (b or {}).get('tc') is not None and b['tc'] not in TC_IDS: errs.append(f'pai.json body {k}: unknown trustees\' committee {b["tc"]}')
    themes = {}
    for i, t in enumerate(pai.get('themes') or []):
        tag = f"pai.json theme {t.get('id', i)}"
        if not t.get('id') or t['id'] in themes: errs.append(f'{tag}: missing or duplicate id')
        themes[t.get('id')] = t
        if t.get('family') not in fams: errs.append(f'{tag}: unknown family {t.get("family")}')
        for k in ('name', 'lede'):
            if not t.get(k): errs.append(f'{tag}: {k} missing')
    items, n77 = {}, []
    for i, it in enumerate(pai.get('items') or []):
        key, n = it.get('key'), it.get('n')
        tag = f'pai.json item {key or i}'
        if not isinstance(key, str) or key in items: errs.append(f'{tag}: missing or duplicate key'); continue
        items[key] = it
        if it.get('cycle') == cyc:
            if not isinstance(n, int) or isinstance(n, bool): errs.append(f'{tag}: n {n!r} is not an integer')
            else: n77.append(n)
            if key != str(n): errs.append(f'{tag}: key should be its number {n}')
        elif not (isinstance(cyc, int) and it.get('cycle') == cyc - 1 and re.fullmatch(rf'\d{{4}}-{n}', key) and it.get('status') == 'deferred'):
            errs.append(f'{tag}: an item of cycle {it.get("cycle")} must be deferred from the previous cycle with key "<year>-<n>"')
        if it.get('status') not in PAI_STATUS: errs.append(f'{tag}: status {it.get("status")}')
        # an item removed without its content (e.g. a personnel matter) has no date or summary in the grid
        if (it.get('received') is not None or it.get('summary')) and (not re.fullmatch(r'\d{4}-\d\d-\d\d', str(it.get('received') or '')) or (as_of and it['received'] > as_of)):
            errs.append(f'{tag}: received {it.get("received")!r} is not an ISO date by {as_of}')
        if not isinstance(it.get('page'), int) or not 1 <= it['page'] <= pages: errs.append(f'{tag}: page {it.get("page")}')
        if it.get('body') is not None and it['body'] not in bodies: errs.append(f'{tag}: unknown body {it["body"]}')
        if it.get('body') is None and it.get('status') in PAI_DECIDED | {'under'}: errs.append(f'{tag}: {it["status"]} but sent to no body')
        if it.get('conf_committee') is not None and it['conf_committee'] not in COMMITTEE_IDS: errs.append(f'{tag}: unknown Conference committee {it["conf_committee"]}')
        if it.get('conf_committee') and not it.get('conf_reason'): errs.append(f'{tag}: conf_committee without conf_reason')
        if it.get('summary'):
            for k in PAI_NEEDS:
                if not it.get(k): errs.append(f'{tag}: {k} missing')
        if it.get('asks') is not None and it['asks'] not in asks: errs.append(f'{tag}: unknown asks {it["asks"]}')
        for th in it.get('themes') or []:
            if th not in themes: errs.append(f'{tag}: unknown theme {th}')
        sub = it.get('submitter') or {}
        if it.get('submitter') is not None and sub.get('kind') not in PAI_KINDS: errs.append(f'{tag}: submitter kind {sub.get("kind")}')
        for a in sub.get('areas') or []:
            if areas is not None and a not in areas: errs.append(f'{tag}: submitter area {a} does not exist')
        if len(str(it.get('quote') or '').split()) > 15: errs.append(f'{tag}: quote longer than 15 words (summaries only: the grid keeps the wording)')
        if it.get('status') == 'superseded' and not it.get('superseded_by'): errs.append(f'{tag}: superseded by nothing')
    if isinstance(total, int) and sorted(n77) != list(range(1, total + 1)):
        errs.append(f'pai.json: the {cyc}th-cycle items are not numbered 1..{total} (have {len(n77)}; missing {sorted(set(range(1, total + 1)) - set(n77))[:10]}, extra {sorted(x for x in n77 if not (isinstance(x, int) and 1 <= x <= total))[:10]})')
    for key, it in items.items():
        for k in ('same_as', 'superseded_by'):
            if it.get(k) is not None and (it[k] not in items or it[k] == key): errs.append(f'pai.json item {key}: {k} {it[k]!r} is not another item')
        if it.get('near') is not None and (it['near'] is not True or not it.get('same_as')): errs.append(f'pai.json item {key}: near must be true, on a same_as copy')
        # the page folds a copy into its original one level deep: a copy of a copy would vanish from the default list
        if it.get('same_as') in items and items[it['same_as']].get('same_as'):
            errs.append(f'pai.json item {key}: same_as {it["same_as"]!r} is itself a copy (point at the original)')
    clusters = {}
    for c in pai.get('clusters') or []:
        clusters[c.get('id')] = c
        ks = c.get('keys') or []
        for k in ks:
            if k not in items: errs.append(f'pai.json cluster {c.get("id")}: no item {k}')
            elif items[k].get('cluster') != c.get('id'): errs.append(f'pai.json cluster {c.get("id")}: item {k} says cluster {items[k].get("cluster")}')
        if not isinstance(c.get('copies'), int) or not 0 <= c['copies'] < max(len(ks), 1): errs.append(f'pai.json cluster {c.get("id")}: copies {c.get("copies")} for {len(ks)} items')
    for key, it in items.items():
        if it.get('cluster') is not None and it['cluster'] not in clusters: errs.append(f'pai.json item {key}: unknown cluster {it["cluster"]}')
    last = pai.get('last') or {}
    if last:   # the page prints these as figures and shares
        for k in ('total', 'forwarded', 'not_forwarded', 'withdrawn'):
            if not isinstance(last.get(k), int) or isinstance(last.get(k), bool): errs.append(f'pai.json last: {k} must be an integer')
    for b in last.get('by_body') or []:
        if b.get('key') not in bodies and b.get('key') != 'WD': errs.append(f'pai.json last.by_body: unknown body {b.get("key")}')   # WD = withdrawn
    for t in last.get('theme_counts') or []:
        if t.get('theme') not in themes: errs.append(f'pai.json last.theme_counts: unknown theme {t.get("theme")}')
    for f in last.get('forwarded_items') or []:
        if f.get('conf_committee') is not None and f['conf_committee'] not in COMMITTEE_IDS: errs.append(f'pai.json last.forwarded_items #{f.get("n")}: unknown committee {f["conf_committee"]}')
    errs += check_pai_decisions(pai, items, themes, bodies, cal, packets)
    # ids and privacy, anywhere in the file
    acts = {a.get('id') for a in (aa or {}).get('actions', [])}
    nodes = {n.get('id') for n in (learn or {}).get('nodes', [])}

    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ('aa', 'related_aa', 'learn') and isinstance(v, list):
                    known, what = (nodes, 'Learn node') if k == 'learn' else (acts, 'Advisory Action')
                    for x in v:
                        if x not in known: errs.append(f'{path}.{k}: no {what} {x!r}')
                walk(v, f'{path}.{k}')
        elif isinstance(o, list):
            for i, v in enumerate(o):   # items by key, themes by id
                walk(v, f'{path}[{v.get("key") or v.get("id") or i if isinstance(v, dict) else i}]')
        elif isinstance(o, str):
            for rx, what in PAI_PRIVATE:
                m = rx.search(o)
                if m: errs.append(f'{path}: looks like {what} ({m.group(0)!r}); keep it out of the repo')
    walk(pai, 'pai.json')
    return errs


STUDY_FILES = {   # study features: file -> key in FCR.RAW (each optional)
    'quiz_gen.json': 'quizGen',                    # generated quiz modes: Which Concept? / Which committee does this?
    'timelines.json': 'timelines',                 # Learn timelines: founding era 1935-1962, a delegate's two-year term
    'election_steps.json': 'electionSteps',        # Openings: steps of a regional trustee election
    'structure_checks.json': 'structureChecks',    # Structure: who can correct whom (checks and balances)
}


def check_study(name, d):
    """Every list item in a study file carries a printed Service Manual page (or a 'source') and short own-words text
    (<= 45 words per text field; the manual is (c) AAWS, so no long copies)."""
    errs = []

    def walk(o, path):
        if isinstance(o, dict):
            if any(k in o for k in ('text', 'cue', 'duty', 'label')) and not (o.get('page') or o.get('source')):
                errs.append(f'{name} {path}: no page or source')
            for k in ('text', 'cue', 'duty', 'label', 'title'):
                v = o.get(k)
                if isinstance(v, str) and len(v.split()) > 45:
                    errs.append(f'{name} {path}.{k}: longer than 45 words')
            for k, v in o.items():
                if k != 'meta':
                    walk(v, f'{path}.{k}')
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f'{path}[{i}]')
    walk(d, '')
    return errs


BM_KINDS = {'minutes', 'board', 'trustees_committee', 'session', 'other'}
BM_REC_STATUS = {'approved', 'no_vote', 'tabled', 'in_progress', 'declined', 'referred'}   # recommendations[].status
BM_SEASON = {1: 'winter', 2: 'spring', 3: 'summer', 4: 'fall'}                            # quarter -> season


def bm_date(s, month_ok=False):
    """A real calendar date 'YYYY-MM-DD' (with month_ok also 'YYYY-MM', an approximate month)."""
    s = str(s or '')
    if not re.fullmatch(r'\d{4}-\d\d(-\d\d)?' if month_ok else r'\d{4}-\d\d-\d\d', s):
        return False
    try:
        __import__('datetime').date.fromisoformat(s if len(s) == 10 else s + '-01')
        return True
    except ValueError:
        return False


def check_board_meetings(bm, cal, fu, pai):
    """board_meetings.json (Board Weekends page): the General Service Board's quarterly weekends, newest first, each
    with one own-words card per report in the packet GSO sends Conference members (the packet stays in Drive). Meeting
    id = the board meeting's ISO date; report ids unique; ISO dates ('YYYY-MM' only for approximate next/coming_up
    dates); every page an integer 1..source.pages; every text <= 45 words; kinds, trustees' committees (tc), pai.json
    bodies, calendar events, followups.json requests and report refs exist; recommendations carry a status and a board;
    coming_up is in date order; a card's PAI counts add up and, when pai.json carries this weekend's decisions (met from
    start to end; a later decision on an item of pai_cycle, such as an interim meeting's, counts as 'other' here, under
    decision.prior.by at the weekend that made the referral), match them for the card's body; no service numbers,
    e-mail addresses or phone numbers."""
    errs = []
    if not bm:
        return errs
    events = {e.get('id') for e in (cal or {}).get('events', [])}
    reqs = {r.get('id') for r in (fu or {}).get('requests', [])}
    bodies = set((pai or {}).get('bodies') or {})
    seen, prev = set(), None
    for mi, m in enumerate(bm.get('meetings') or []):
        tag = f"board_meetings.json {m.get('id', mi)}"
        mid = m.get('id')
        if not isinstance(mid, str) or not bm_date(mid) or mid in seen or mid != m.get('board_meeting'):
            errs.append(f'{tag}: id must be unique and equal the board meeting date')
        seen.add(mid)
        if prev is not None and str(mid) >= prev: errs.append(f'{tag}: meetings must be listed newest first')
        prev = str(mid)
        for k in ('start', 'end', 'board_meeting'):
            if not bm_date(str(m.get(k) or '')): errs.append(f'{tag}: {k} {m.get(k)!r} is not an ISO date')
        if not str(m.get('start')) <= str(m.get('board_meeting')) <= str(m.get('end')): errs.append(f'{tag}: board_meeting is not within start..end')
        if m.get('quarter') not in BM_SEASON or m.get('season') != BM_SEASON.get(m.get('quarter')): errs.append(f'{tag}: quarter {m.get("quarter")!r} / season {m.get("season")!r}')
        if not isinstance(m.get('year'), int) or not str(m.get('board_meeting')).startswith(str(m.get('year'))): errs.append(f'{tag}: year {m.get("year")!r}')
        for k in ('title', 'formal', 'place', 'source', 'reports'):
            if not m.get(k): errs.append(f'{tag}: {k} missing')
        if m.get('calendar_id') is not None and m['calendar_id'] not in events: errs.append(f'{tag}: no calendar event {m["calendar_id"]!r}')
        if m.get('pai_cycle') is not None and (not isinstance(m['pai_cycle'], int) or isinstance(m['pai_cycle'], bool)): errs.append(f'{tag}: pai_cycle must be an integer')
        src = m.get('source') or {}
        for k in ('title', 'short', 'pages', 'drive_url', 'minutes_status'):
            if not src.get(k): errs.append(f'{tag}: source.{k} missing')
        if not re.match(r'https://drive\.google\.com/file/d/[\w-]+/view$', str(src.get('drive_url') or '')): errs.append(f'{tag}: source.drive_url is not a Drive file link')
        if not all(isinstance(s, str) and s.strip() for s in src.get('slips') or []): errs.append(f'{tag}: source.slips must be own-words strings')
        pages = src.get('pages') if isinstance(src.get('pages'), int) else 0

        def walk(o, path):   # pages, calendar ids, length and privacy of every string
            if isinstance(o, dict):
                for k, v in o.items():
                    if k in ('page', 'accepted_page') and v is not None and (not isinstance(v, int) or isinstance(v, bool) or not 1 <= v <= pages):
                        errs.append(f'{path}.{k}: {v!r} is not a page 1..{pages}')
                    if k == 'calendar_id' and v is not None and v not in events: errs.append(f'{path}: no calendar event {v!r}')
                    walk(v, f'{path}.{k}')
            elif isinstance(o, list):
                for i, v in enumerate(o):
                    walk(v, f'{path}[{i}]')
            elif isinstance(o, str):
                if len(o.split()) > 45: errs.append(f'{path}: longer than 45 words')
                for rx, what in PAI_PRIVATE:
                    hit = rx.search(o)
                    if hit: errs.append(f'{path}: looks like {what} ({hit.group(0)!r}); keep it out of the repo')
        walk(m, tag)

        def need(o, keys, path):
            for k in keys:
                if not isinstance(o, dict) or o.get(k) in (None, ''): errs.append(f'{path}: {k} missing')

        def dated(lst, path):
            for i, e in enumerate(lst or []):
                p = f'{path}[{i}]'
                need(e, ('date', 'text', 'page'), p)
                d = str((e or {}).get('date') or '')
                if not bm_date(d, True): errs.append(f'{p}: date {d!r} is not YYYY-MM-DD or YYYY-MM')
                if not isinstance((e or {}).get('approx'), bool) or (len(d) == 7 and e.get('approx') is not True): errs.append(f'{p}: approx must be true/false (true for a month-only date)')
                if (e or {}).get('end') is not None and (not bm_date(str(e['end'])) or str(e['end']) < d): errs.append(f'{p}: end {e.get("end")!r}')
        for i, o in enumerate(m.get('overview') or []): need(o, ('text', 'page'), f'{tag}.overview[{i}]')
        if not 3 <= len(m.get('overview') or []) <= 5: errs.append(f'{tag}: overview needs 3-5 sentences')
        att = m.get('attendance')
        if att is not None and not (isinstance(att.get('trustees_present'), int) and isinstance(att.get('trustees_total'), int) and 0 <= att['trustees_present'] <= att['trustees_total']):
            errs.append(f'{tag}: attendance counts')
        dated(m.get('coming_up'), f'{tag}.coming_up')
        cu = [str((e or {}).get('date') or '') for e in m.get('coming_up') or []]
        if cu != sorted(cu): errs.append(f'{tag}: coming_up must be in date order')
        rids = [r.get('id') for r in m.get('reports') or []]
        for i, x in enumerate(m.get('numbers') or []):
            need(x, ('label', 'value', 'page', 'report'), f'{tag}.numbers[{i}]')
            if x.get('report') not in rids: errs.append(f'{tag}.numbers[{i}]: no report {x.get("report")!r}')
            if not isinstance(x.get('value'), str): errs.append(f'{tag}.numbers[{i}]: value must be the printed text')
        # this weekend's decisions in pai.json, by reviewing body: forwarded / no action / other. A decision made after
        # the weekend on an item of its cycle (an interim meeting's) was still open here, so it counts as 'other', under
        # the body that held it at this weekend: decision.prior.by when the referral was made at this weekend (prior.met
        # on or after its start; a later decision from another body, the referral's outcome, replaced that weekend's
        # one), else decision.by.
        dec, m0, m1 = {}, str(m.get('start') or ''), str(m.get('end') or '')
        for it in (pai or {}).get('items') or []:
            dd = it.get('decision')
            met = str(dd.get('met') or '') if isinstance(dd, dict) else ''
            if not met or not m0 or not m1: continue
            if m0 <= met <= m1:
                kind = 'forwarded' if dd.get('action') in ('forwarded', 'forwarded_topic') else 'no_action' if dd.get('action') == 'no_action' else 'other'
            elif met > m1 and m.get('pai_cycle') is not None and it.get('cycle') == m['pai_cycle']:
                kind = 'other'
            else:
                continue
            prior = dd.get('prior') if isinstance(dd.get('prior'), dict) else {}
            who = prior.get('by') if (met > m1 and prior.get('by') and str(prior.get('met') or '') >= m0) else dd.get('by')
            dec.setdefault(who, {'forwarded': 0, 'no_action': 0, 'other': 0})[kind] += 1
        rseen = set()
        for r in m.get('reports') or []:
            rt = f"{tag} report {r.get('id')}"
            if not re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', str(r.get('id') or '')) or r['id'] in rseen: errs.append(f'{rt}: missing, malformed or duplicate id')
            rseen.add(r.get('id'))
            need(r, ('name', 'summary'), rt)
            if r.get('kind') not in BM_KINDS: errs.append(f'{rt}: kind {r.get("kind")!r}')
            if r.get('tc') is not None and r['tc'] not in TC_IDS: errs.append(f'{rt}: unknown trustees\' committee {r["tc"]!r}')
            if r.get('kind') == 'trustees_committee' and not r.get('tc'): errs.append(f'{rt}: a trustees\' committee card needs tc')
            if r.get('body') is not None and bodies and r['body'] not in bodies: errs.append(f'{rt}: unknown pai.json body {r["body"]!r}')
            if r.get('met') is not None and not bm_date(str(r['met'])): errs.append(f'{rt}: met {r["met"]!r} is not an ISO date')
            if r.get('accepted') is not None and not isinstance(r['accepted'], str): errs.append(f'{rt}: accepted must be text or null')
            if not 3 <= len(r.get('highlights') or []) <= 8: errs.append(f'{rt}: {len(r.get("highlights") or [])} highlights (3-8)')
            for i, x in enumerate(r.get('highlights') or []): need(x, ('text', 'page'), f'{rt}.highlights[{i}]')
            for i, x in enumerate(r.get('recommendations') or []):
                need(x, ('text', 'outcome', 'page', 'status', 'board'), f'{rt}.recommendations[{i}]')
                if x.get('status') is not None and x['status'] not in BM_REC_STATUS: errs.append(f'{rt}.recommendations[{i}]: status {x["status"]!r}')
                if x.get('board') is not None and x['board'] not in ('GSB', 'AAWS', 'GV'): errs.append(f'{rt}.recommendations[{i}]: board {x["board"]!r}')
            for i, x in enumerate(r.get('numbers') or []):
                need(x, ('label', 'value', 'page'), f'{rt}.numbers[{i}]')
                if not isinstance(x.get('value'), str): errs.append(f'{rt}.numbers[{i}]: value must be the printed text')
            dated(r.get('next'), f'{rt}.next')
            for i, x in enumerate(r.get('followups') or []):
                need(x, ('text', 'page'), f'{rt}.followups[{i}]')
                if x.get('request') is not None and x['request'] not in reqs: errs.append(f'{rt}.followups[{i}]: no followups.json request {x["request"]!r}')
            p = r.get('pai')
            if p is not None and not r.get('body'): errs.append(f'{rt}: pai counts need a body (the pai.json body they count)')
            if p is not None:
                ks = ('assigned', 'considered', 'forwarded', 'no_action', 'other')
                if not all(isinstance(p.get(k), int) and not isinstance(p.get(k), bool) and p[k] >= 0 for k in ks): errs.append(f'{rt}: pai counts must be integers'); continue
                if p['forwarded'] + p['no_action'] + p['other'] != p['assigned'] or p['considered'] > p['assigned']: errs.append(f'{rt}: pai counts do not add up')
                got = dec.get(r.get('body'))
                if dec and got and (got['forwarded'], got['no_action'], got['other']) != (p['forwarded'], p['no_action'], p['other']):
                    errs.append(f'{rt}: pai counts {p["forwarded"]}/{p["no_action"]}/{p["other"]} differ from pai.json decisions {got["forwarded"]}/{got["no_action"]}/{got["other"]}')
    return errs


LEARN_MODES = {'manual', 'rules', 'region'}   # view-quiz.js decks a bank question can join (none: Service Manual + All)
LEARN_PACKET_CITE = re.compile(r'(Q[1-4] \d{4} board reports)(?: (pp?)\. (N\b|\d+(?:-\d+)?(?:, \d+(?:-\d+)?)*))?')   # 'p. N' = the format


def check_learn(learn, packets=None):
    """learn.json: unique node ids whose parents, see_also, glossary and quiz links resolve; glossary terms and quiz
    questions unique and cited (page or source); each question has three distinct wrong choices, none equal to the
    answer, and a known deck mode; every packet cite reads 'Q[1-4] YYYY board reports p./pp. N', names a known packet and
    has pages inside it (packets = board_packets(): short cite -> {pages, …}); and the correct answer is the strictly longest choice (in characters) in at most
    40% of the bank (the method learn.json's audit records)."""
    errs, packets = [], packets or {}
    nodes = learn.get('nodes', [])
    ids = [n.get('id') for n in nodes]
    byid = {n.get('id'): n for n in nodes}
    errs += [f'learn.json node {i}: id used twice' for i in sorted({i for i in ids if ids.count(i) > 1})]
    for n in nodes:
        p, seen = n.get('parent'), {n.get('id')}
        while p is not None:
            if p not in byid or p in seen:
                errs.append(f'learn.json node {n.get("id")}: parent {p} unknown or a loop')
                break
            seen.add(p)
            p = byid[p].get('parent')
        errs += [f'learn.json node {n.get("id")}: see_also {s.get("node")} unknown' for s in n.get('see_also') or [] if s.get('node') not in byid]
    terms = set()
    for g in learn.get('glossary', []):
        t = g.get('term')
        if not t or not g.get('definition') or t in terms:
            errs.append(f'learn.json glossary {t!r}: needs a term and definition, once')
        if not (g.get('page') or g.get('source')):
            errs.append(f'learn.json glossary {t!r}: no page or source')
        if g.get('node') and g['node'] not in byid:
            errs.append(f'learn.json glossary {t!r}: node {g["node"]} unknown')
        terms.add(t)
    asked, longest, bank = set(), 0, learn.get('quiz', [])
    for q in bank:
        tag, w = f'learn.json quiz {str(q.get("q"))[:60]!r}', q.get('wrong') if isinstance(q.get('wrong'), list) else []
        if not q.get('q') or not q.get('a') or len(w) != 3 or len(set(w)) != 3 or q['a'] in w or not all(isinstance(x, str) and x for x in w):
            errs.append(f'{tag}: needs q, a and three distinct wrong choices other than the answer')
            continue
        if q['q'] in asked:
            errs.append(f'{tag}: asked twice')
        if q.get('node') not in byid:
            errs.append(f'{tag}: node {q.get("node")} unknown')
        if not (q.get('page') or q.get('source')):
            errs.append(f'{tag}: no page or source')
        if (q.get('mode') is not None and q['mode'] not in LEARN_MODES) or (q.get('mode') == 'region' and not q.get('region')):
            errs.append(f'{tag}: mode {q.get("mode")!r} unknown or without its region')
        asked.add(q['q'])
        longest += len(q['a']) > max(len(x) for x in w)
    if bank and longest > 0.4 * len(bank):
        errs.append(f'learn.json quiz: the correct answer is the longest choice in {longest} of {len(bank)} questions (over 40%)')

    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, f'{path}.{k}')
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f'{path}[{i}]')
        elif isinstance(o, str):
            for m in LEARN_PACKET_CITE.finditer(o):
                if m.group(3) == 'N':
                    continue
                pk = packets.get(m.group(1))
                if pk is None:
                    errs.append(f'learn.json{path}: {m.group(0)!r} names no known packet (board_meetings.json source.short)')
                    continue
                nums, top = [int(x) for x in re.findall(r'\d+', m.group(3) or '')], (pk.get('pages') if isinstance(pk, dict) else pk)
                if not nums or (m.group(2) == 'p') != (len(nums) == 1) or any(x < 1 or (top and x > top) for x in nums):
                    errs.append(f'learn.json{path}: {m.group(0)!r}: needs "p. N" (one page) or "pp. N, M" inside the packet ({top or "?"} pages)')
    walk(learn, '')
    return errs


def add_followup_events(cal, aa, fu, conferences, latest):
    """Calendar events (made on every build, never stored) for follow-ups due from the latest report's year on: Advisory
    Action follow-ups and the dated requests in followups.json, without those an outcome marks 'superseded' (their new
    date is a request of its own). One event per Conference ('aa-followups-YYYY'), per stated month ('-MM') or per year
    for items due 'during' it ('-year', Jan 1-Dec 31, approx), linked to #/actions/pending. Malformed entries are skipped
    here; --check reports them."""
    if not (aa or fu) or not isinstance(cal, dict):
        return 0
    gone = {(o.get('action') or o.get('request'), o.get('due_year'))
            for o in (fu or {}).get('outcomes', []) if o.get('status') == 'superseded'}

    # 'update' outcomes (news before an item falls due, e.g. a Convention site chosen) ride along in the event text
    upd = {}
    for o in (fu or {}).get('outcomes', []):
        ys = [2000 + int(y) for y in re.findall(r'FR(\d\d)', o.get('ref') or '')]
        if o.get('status') == 'update' and isinstance(o.get('text'), str) and (not ys or max(ys) <= latest):
            upd[(o.get('action') or o.get('request'), o.get('due_year'))] = o['text'].rstrip('.')
    note = lambda k, w: f"{w.rstrip('.')} (update: {upd[k]})" if k in upd else w

    def usable(d, text):
        return (isinstance(d, dict) and isinstance(d.get('year'), int) and d['year'] >= latest
                and isinstance(text, str) and bool(text.strip()) and d.get('month') in (None, *range(1, 13)))
    groups = {}
    key = lambda d: (d['year'], d.get('month') or (13 if d.get('during') else 0))  # 13 = some time in the year
    for a in (aa or {}).get('actions', []):
        dues = a.get('due') if isinstance(a.get('due'), list) else []
        for d in dues:
            if usable(d, d.get('what') if isinstance(d, dict) else None) and (a.get('id'), d['year']) not in gone:
                groups.setdefault(key(d), []).append(note((a.get('id'), d['year']), d['what']))
    for r in (fu or {}).get('requests', []):
        d = r.get('due')
        if usable(d, r.get('text')) and (r.get('id'), d['year']) not in gone:
            groups.setdefault(key(d), []).append(note((r.get('id'), d['year']), r['text']))
    dates = cal.get('conference_dates') or {}
    for (y, m), whats in sorted(groups.items()):
        cd = dates.get(str(y))
        if m == 13:
            start, end, label, approx = f'{y}-01-01', f'{y}-12-31', f'during {y}', True
            sid = f'aa-followups-{y}-year'
        elif m:   # a stated month, as the page says "by <Month> <year>"
            import calendar as _c
            start, end, label, approx = f'{y}-{m:02d}-01', f'{y}-{m:02d}-{_c.monthrange(y, m)[1]:02d}', f'in {_c.month_name[m]} {y}', True
            sid = f'aa-followups-{y}-{m:02d}'
        else:
            start, end = (cd['start'], cd['end']) if cd else (f'{y}-04-15', f'{y}-04-30')
            approx = not cd or bool(cd.get('approx'))
            n = y - 1950
            label = f'at the {n}{"th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")} Conference'
            sid = f'aa-followups-{y}'
        cal.setdefault('events', []).append({
            'id': sid, 'title': f'Follow-ups due {label} ({len(whats)})',
            'category': 'conference', 'scope': 'all', 'start': start, 'end': end, 'approx': approx, 'status': 'scheduled',
            'why': 'Earlier Conferences set these for this date (Advisory Actions, and requests in the Final Reports): '
                   + ' · '.join(w.rstrip('.') for w in whats[:3]) + (f' · and {len(whats) - 3} more' if len(whats) > 3 else '') + '.',
            'what_to_do': 'Check each one on the Advisory Actions page, so none is missed.',
            'source': 'Advisory Actions of the General Service Conference 1951-2026 (M-39); Final Conference Reports', 'confidence': 'high',
            'url': '#/actions/pending', 'generated': True})
    return len(groups)


def main():
    years = {}
    for p in sorted(glob.glob(os.path.join(SRC, 'years', '*.json'))):
        with open(p, encoding='utf-8') as f:
            d = json.load(f)
        src = d.get('source') or {}
        if src.get('file'):  # keep only the file name, never a local path
            src['file'] = os.path.basename(src['file'].replace('\\', '/'))
        years[str(d['year'])] = d
    normalize_delegates(years)
    apply_chair_seat(years)
    applied, misses, glob_ops = apply_corrections(years, load('corrections.json', []))
    filled = fill_past_delegates(years)
    derived = derive_next_chairs(years)
    areas = load('areas.json', {'regions': [], 'areas': []})
    sites = load('area_websites.json', {}).get('areas', {})
    for a in areas.get('areas', []):
        s = sites.get(str(a['n']))
        if s:
            a['website'] = s.get('website')
            a['official_name'] = s.get('official_name')
    rules = load('rules.json', {})
    elects = load('panel_elects.json', {})
    analysis = load('analysis.json', {})
    conferences = load('conferences.json', {})
    board = load('board.json', {})
    actions = load('advisory_actions.json', {})
    fu = load('followups.json', {})
    pai = load('pai.json', {})
    bm = load('board_meetings.json', {})
    study ={key: load(f, {}) for f, key in STUDY_FILES.items()}
    calendar = load('calendar.json', {})
    followups = add_followup_events(calendar, actions, fu, conferences, max(int(y) for y in years))
    data = {
        'generated': __import__('datetime').date.today().isoformat(),
        'years': years,
        'areas': areas.get('areas', []),
        'regions': areas.get('regions', []),
        'rules': rules,
        'panelElects': elects.get('areas', []) if isinstance(elects, dict) else elects,
        'panelElectsMeta': {k: v for k, v in elects.items() if k != 'areas'} if isinstance(elects, dict) else {},
        'reports': load('reports.json', []),
        'drive': load('drive.json', {}),
        'learn': load('learn.json', {}),
        'adjacency': load('adjacency.json', {}).get('pairs', []),
        'analysis': analysis,
        'calendar': calendar,                             # recurring cycle + dated events (+ generated Advisory Action follow-ups)
        'advisoryActions': actions,                       # M-39 index: year, section, page, own-words summary, follow-ups
        'followups': fu,                                  # dated requests in the Final Reports + outcomes of follow-ups
        'pai': pai,                                       # proposed agenda items of the next Conference (GSO status grid), own-words summaries
        'boardMeetings': bm,                              # Board Weekends: quarterly board weekends, one own-words card per packet report
        **study,                                          # study features (STUDY_FILES)
        'conferences': conferences,                       # per-Conference facts, future dates, forums, conventions
        'board': board,                                   # post-Conference slates, emeriti, general managers
        'forecast': load('forecast.json', {}),            # precomputed high-precision committee odds
        'aliases': glob_ops['aliases'],                   # name variants of one person (corrections op 'alias')
        'distinctPeople': glob_ops['distinct_people'],    # same printed name, different people
        'modelDefaults': analysis.get('model_defaults', {}),
        'termYears': rules.get('term_years', {}),
    }
    out = os.path.join(ROOT, 'data', 'fcr-data.js')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* Generated by tools/build_data.py — do not edit by hand. */\n')
        f.write('window.FCR_DATA = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print(f'wrote {out}: {len(years)} years ({", ".join(sorted(years))}), {len(data["areas"])} areas, '
          f'{os.path.getsize(out) // 1024} KB; corrections applied {len(applied)}, missed {len(misses)}; '
          f'past-delegate areas filled {filled}; next_conference_chair derived {derived}'
          + (f'; advisory actions {len(actions.get("actions", []))}, committee requests {len(fu.get("requests", []))}, '
             f'outcomes {len(fu.get("outcomes", []))} (follow-up calendar events {followups})' if actions else '')
          + (f'; proposed agenda items {sum(1 for i in pai.get("items", []) if i.get("cycle") == (pai.get("source") or {}).get("ordinal"))} '
             f'for GSC {(pai.get("source") or {}).get("ordinal")} (grid of {(pai.get("source") or {}).get("as_of")}) '
             f'+ {sum(1 for i in pai.get("items", []) if i.get("status") == "deferred")} deferred, {len(pai.get("themes", []))} themes' if pai else ''))
    if '--check' in sys.argv:
        errs = [f'correction #{i} ({op}, year {y}) matched nothing: {what}' for i, y, op, what in misses]
        check_names('board.json', board, errs)
        check_names('conferences.json', conferences, errs)
        for g in glob_ops['aliases']:
            check_names('alias', {'names': g['names']}, errs)
        errs += check_reports(data['reports'])
        aerrs, awarn = check_advisory_actions(actions, conferences, years)
        packets = board_packets(bm, pai)   # every board-weekend packet the data may cite: short cite -> pages, start, end
        errs += aerrs + check_followups(fu, actions, pai, packets)
        check_names('followups.json', fu, errs)
        errs += check_pai(pai, actions, data['learn'], {a.get('n') for a in data['areas']}, calendar, packets)
        # theme, family and body 'name's are labels, not people: check every other name-like field
        check_names('pai.json', {k: v for k, v in pai.items() if k not in ('themes', 'families', 'bodies')}, errs)
        check_names('pai.json themes', [{k: v for k, v in t.items() if k != 'name'} for t in pai.get('themes', [])], errs)
        for f, key in STUDY_FILES.items():
            errs += check_study(f, study[key])
            check_names(f, study[key], errs)
        errs += check_learn(data['learn'], packets)
        errs += check_board_meetings(bm, calendar, fu, pai)
        # report 'name's are labels ("Trustees' Literature Committee"), not people: check every other name-like field
        check_names('board_meetings.json', [dict(m, reports=[{k: v for k, v in r.items() if k != 'name'} for r in m.get('reports') or []])
                                            for m in bm.get('meetings') or []], errs)
        for w in awarn:
            print('WARNING', w)
        for e in errs:
            print('ERROR  ', e)
        print(f'== corrections/board/conferences/reports: {len(errs)} ERRORS')
        files = sorted(glob.glob(os.path.join(SRC, 'years', '*.json')))
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'validate_year.py'), *files])
        sys.exit(1 if errs else r.returncode)


if __name__ == '__main__':
    main()
