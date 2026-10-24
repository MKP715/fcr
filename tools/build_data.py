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
  data/src/advisory_actions.json  index of the Conference's Advisory Actions 1951-2026 (GSO item M-39): year, section,
                                page, a summary in our own words (the original wording stays in the PDF), follow-up dates
                                (tools/dev/m39_merge.py); follow-ups due from the latest report's year on become Calendar events
  data/src/followups.json       dated requests in the Final Reports (committee, board, trustees' and G.S.O. reports) that are
                                not Advisory Actions, and what became of follow-ups once due (hand-checked; dated ones are
                                also generated Calendar events) (optional)
  data/src/pai.json             proposed agenda items of the next Conference from GSO's status grid: own-words summaries,
                                themes, related Advisory Actions, last cycle's outcomes (the grid itself, with the
                                submitted wording and group names, stays in Drive) (optional)
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


def check_followups(fu, aa):
    """followups.json: requests in the Final Reports (committee, board, trustees' and G.S.O. reports) that are dated for
    later and are not Advisory Actions (only kind 'committed' may have no date), and what became of a follow-up once it
    fell due. Own-words text only; request refs 'FRyy pP Lx-y', outcome refs may list several 'FRyy pP …; pQ …'."""
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
    return errs


TC_IDS = {'CONFERENCE', 'ARCHIVES', 'CPCTA', 'CORRECTIONS', 'FINANCE', 'ICRF', 'LITERATURE', 'NOMINATING', 'PI',   # FCR.TRUSTEES_COMMITTEES
           'INTERNATIONAL', 'AUDIT', 'COMPENSATION', 'SHARING'}
PAI_STATUS = {'under', 'withdrawn', 'superseded', 'removed', 'deferred'}
PAI_KINDS = {'group', 'district', 'area', 'committee', 'individual', 'unstated'}
PAI_NEEDS = ('title', 'asks', 'themes', 'targets', 'submitter', 'language')   # every item that has a summary
# Privacy: a group's service number (#123456, or any 6+ digit run), an e-mail address, a phone number
PAI_PRIVATE = [(re.compile(r'#\s*\d{5,}|\b\d{6,}\b'), 'a group service number'), (re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+'), 'an e-mail address'),
               (re.compile(r'\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b'), 'a phone number')]


def check_pai(pai, aa, learn, areas=None):
    """pai.json (proposed agenda items of the next Conference, from GSO's status grid): unique keys; the grid's items of
    cycle source.ordinal numbered 1..source.total (key = the number; items deferred from an earlier cycle '<year>-<n>');
    every theme, family, body, asks and Conference committee id known; every Advisory Action ('aa', 'related_aa'), Learn
    node ('learn') and area id exists; same_as / superseded_by / cluster keys point at items (same_as = identical or, with
    near: true, near-identical wording, always the original, never another copy); items with a summary carry
    the fields the page shows. The grid prints motions as submitted, so the repo keeps own-words summaries only (a quote
    of at most 15 words); no group service numbers, e-mail addresses or phone numbers anywhere."""
    errs = []
    if not pai:
        return errs
    src = pai.get('source') or {}
    cyc, total, pages, as_of = src.get('ordinal'), src.get('total'), src.get('pages') or 999, src.get('as_of') or ''
    for k in ('title', 'as_of', 'total', 'conference_year', 'ordinal', 'drive_name'):
        if not src.get(k): errs.append(f'pai.json source: {k} missing')
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
        if it.get('body') is None and it.get('status') == 'under': errs.append(f'{tag}: under consideration but sent to no body')
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
        errs += aerrs + check_followups(fu, actions)
        check_names('followups.json', fu, errs)
        errs += check_pai(pai, actions, data['learn'], {a.get('n') for a in data['areas']})
        # theme, family and body 'name's are labels, not people: check every other name-like field
        check_names('pai.json', {k: v for k, v in pai.items() if k not in ('themes', 'families', 'bodies')}, errs)
        check_names('pai.json themes', [{k: v for k, v in t.items() if k != 'name'} for t in pai.get('themes', [])], errs)
        for f, key in STUDY_FILES.items():
            errs += check_study(f, study[key])
            check_names(f, study[key], errs)
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
