"""Validate a per-year roster JSON (see YEAR_SCHEMA.md; also checks the optional fields delegates[].elected_delegate,
served_thru, board, succeeds, conference_chair/next_conference_chair/next_conference_alt_chair, general_manager).
Usage: python -P -E validate_year.py <year.json> [...]
Prints ERRORS (must fix) and WARNINGS (fix or explain in notes). Exit code 1 if any errors."""
import json, re, sys
from collections import Counter, defaultdict

CANON = {'AGENDA', 'ARCHIVES', 'CPC', 'CORRECTIONS', 'FINANCE', 'GRAPEVINE', 'ICRF', 'LITERATURE', 'POLICY',
         'PI', 'REPORT', 'TREATMENT', 'TRUSTEES', 'SPECIAL_NEEDS', 'OTHER'}
POS = {'CLASS_A', 'REG_EAST_CENTRAL', 'REG_NORTHEAST', 'REG_SOUTHEAST', 'REG_WEST_CENTRAL', 'REG_SOUTHWEST',
       'REG_PACIFIC', 'REG_EASTERN_CANADA', 'REG_WESTERN_CANADA', 'TAL_US', 'TAL_CANADA', 'GST', 'OTHER',
       'DIR_AAWS', 'DIR_GRAPEVINE', 'GSB_CHAIR'}
SUFFIX = re.compile(r'\b(MD|MBA|CPA|CFA|PhD|FACHE|MPH|FACOG|Esq|JD|RN|LCSW)\b')


def name_ok(n):
    """True when the final surname token is an initial like 'B.' / 'C.-D.' / 'B.-W.' (anonymity format)."""
    if not n or not isinstance(n, str):
        return False
    n = re.sub(r'\(.*?\)', '', n).strip()
    toks = n.split()
    if len(toks) < 2:
        return False
    last = toks[-1]
    return bool(re.fullmatch(r"[A-ZÀ-ÝÉ][A-Za-zà-ÿ]{0,3}\.(?:-[A-ZÀ-ÝÉ][A-Za-zà-ÿ]{0,3}\.?)*", last)) or bool(re.fullmatch(r"[A-ZÀ-ÝÉ]\.?-[A-ZÀ-ÝÉ]\.?", last))


def main(path):
    E, W = [], []
    d = json.load(open(path, encoding='utf-8'))
    y = d.get('year')
    if not isinstance(y, int):
        E.append('year missing'); y = 0
    if d.get('ordinal') != y - 1950:
        E.append(f"ordinal {d.get('ordinal')} != year-1950 ({y-1950})")
    p_new, p_old = y - 1950, y - 1951

    names = []

    # delegates
    dels = d.get('delegates') or []
    if not dels:
        E.append('no delegates')
    byarea = {}
    for x in dels:
        a = x.get('area')
        if not isinstance(a, int) or not 1 <= a <= 93:
            E.append(f'bad delegate area {a!r}'); continue
        if a in byarea:
            E.append(f'duplicate delegate area {a}')
        byarea[a] = x
        st = x.get('status', 'delegate')
        if st not in ('delegate', 'alternate', 'vacant'):
            E.append(f'area {a}: status {st!r} not delegate/alternate/vacant')
        for k in ('elected_delegate', 'alternate_seated', 'printed_name'):
            if x.get(k):
                names.append((f'delegate {k}', x[k]))
        if st != 'vacant':
            names.append(('delegate', x.get('name')))
            if x.get('panel') not in (p_new, p_old):
                E.append(f"area {a} panel {x.get('panel')} not in ({p_old},{p_new})")
    missing = [a for a in range(1, 94) if a not in byarea]
    if missing:
        (W if len(missing) <= 3 else E).append(f'areas missing from delegates list: {missing}')
    if dels:
        pc = Counter(x.get('panel') for x in dels)
        W.append(f'INFO panel counts: {dict(pc)}') if False else None

    # conference committees
    cc = d.get('conference_committees') or []
    if not cc:
        E.append('no conference_committees')
    primary_of = defaultdict(list)
    for c in cc:
        cid = c.get('committee')
        if cid not in CANON:
            E.append(f'committee id {cid!r} not canonical')
        roles = Counter(m.get('role') for m in c.get('members', []))
        if roles.get('chair', 0) != 1:
            W.append(f"{cid}: {roles.get('chair',0)} chairs marked")
        if roles.get('alt_chair', 0) != 1:
            W.append(f"{cid}: {roles.get('alt_chair',0)} alt chairs marked")
        if c.get('secretary'):
            names.append(('secretary', c['secretary']))
        for m in c.get('members', []):
            names.append(('committee member', m.get('name')))
            a = m.get('area')
            if a is None:
                continue
            if a not in byarea:
                E.append(f'{cid}: member area {a} not in delegates')
                continue
            dl = byarea[a]
            if m.get('panel') != dl.get('panel'):
                E.append(f"{cid}: area {a} panel {m.get('panel')} != delegate list panel {dl.get('panel')}")
            if dl.get('name') and m.get('name') and m['name'].split()[0].strip('.').lower()[:3] != dl['name'].split()[0].strip('.').lower()[:3]:
                W.append(f"{cid}: area {a} member name {m.get('name')!r} vs delegate {dl.get('name')!r}")
            if not c.get('secondary'):
                primary_of[a].append(cid)
        n = len(c.get('members', []))
        if not c.get('secondary') and not 6 <= n <= 12:
            W.append(f'{cid}: unusual size {n}')
    for a, x in byarea.items():
        if x.get('status', 'delegate') == 'vacant':
            continue
        k = len(primary_of.get(a, []))
        if k == 0:
            W.append(f'area {a} has no primary committee')
        elif k > 1:
            E.append(f'area {a} on {k} primary committees {primary_of[a]}')

    # next-year chairs
    for nc in d.get('next_year_chairs') or []:
        if nc.get('committee') not in CANON:
            E.append(f"next_year_chairs committee {nc.get('committee')!r} not canonical")
        for k in ('chair', 'alternate'):
            p = nc.get(k) or {}
            a = p.get('area')
            names.append((f'next-year {k}', p.get('name')))
            if a in byarea and byarea[a].get('panel') != p_new:
                W.append(f"next-year {k} {p.get('name')} area {a} is panel {byarea[a].get('panel')} (expected first-year panel {p_new})")
            if a in byarea and nc.get('committee') not in primary_of.get(a, []) and nc.get('committee') not in ('ARCHIVES', 'ICRF'):
                W.append(f"next-year {k} {p.get('name')} (area {a}) not a member of {nc.get('committee')} this year")
    if not d.get('next_year_chairs'):
        W.append('next_year_chairs empty (explain in notes if the table is absent)')

    # trustees committees
    for t in d.get('trustees_committees') or []:
        for m in t.get('members', []):
            names.append(('trustees committee', m.get('name')))
            if m.get('type') not in ('chair', 'member', 'appointed', 'consultant'):
                E.append(f"trustees committee {t.get('committee')}: bad type {m.get('type')!r}")
    if not d.get('trustees_committees'):
        W.append('trustees_committees empty')

    def check_board_record(label, t):
        ey = t.get('elected_year')
        if ey is not None and not (isinstance(ey, int) and 1990 <= ey <= y):
            E.append(f"{label} {t.get('name')}: elected_year {ey!r}")
        pd = t.get('past_delegate')
        if pd is not None:
            if not isinstance(pd, dict) or (pd.get('panel') is not None and not isinstance(pd.get('panel'), int))                     or (pd.get('area') is not None and not (isinstance(pd.get('area'), int) and 1 <= pd['area'] <= 93)):
                E.append(f"{label} {t.get('name')}: past_delegate {pd!r}")
        if t.get('served_thru') and not re.search(r'(19|20)\d\d', str(t['served_thru'])):
            W.append(f"{label} {t.get('name')}: served_thru {t['served_thru']!r} has no year")
        if t.get('board') and t['board'] not in ('AAWS', 'Grapevine', 'AA Grapevine'):
            W.append(f"{label} {t.get('name')}: board {t['board']!r}")
        if t.get('succeeds'):
            names.append((f'{label} succeeds', t['succeeds']))
    for t in d.get('trustees') or []:
        check_board_record('trustee', t)
        names.append(('trustee', t.get('name')))
        if t.get('class') not in ('A', 'B'):
            E.append(f"trustee {t.get('name')}: class {t.get('class')!r}")
        if t.get('position_id') not in POS:
            E.append(f"trustee {t.get('name')}: position_id {t.get('position_id')!r}")
    if not d.get('trustees'):
        W.append('trustees empty')
    else:
        ca = sum(1 for t in d['trustees'] if t.get('class') == 'A')
        cb = sum(1 for t in d['trustees'] if t.get('class') == 'B')
        if not (5 <= ca <= 8 and 12 <= cb <= 15):
            W.append(f'trustee counts unusual: class A {ca}, class B {cb}')
    for t in d.get('nontrustee_directors') or []:
        check_board_record('director', t)
        names.append(('director', t.get('name')))
    for t in d.get('newly_elected') or []:
        check_board_record('newly elected', t)
        names.append(('newly elected', t.get('name')))
        if t.get('position_id') not in POS:
            W.append(f"newly_elected {t.get('name')}: position_id {t.get('position_id')!r}")
    # delegate chair of this Conference / of the next one (+ alternate, printed 2017-2018 only)
    for k in ('conference_chair', 'next_conference_chair', 'next_conference_alt_chair'):
        v = d.get(k)
        if v:
            if not isinstance(v, dict) or not (isinstance(v.get('area'), int) and 1 <= v['area'] <= 93):
                E.append(f'{k}: expected {{name, area}}, got {v!r}')
            else:
                names.append((k, v.get('name')))
    if d.get('general_manager'):
        names.append(('general_manager', d['general_manager']))
    if d.get('staff_director'):
        names.append(('staff_director', d['staff_director']))
    for k in ('aaws_directors', 'grapevine_directors', 'gso_staff', 'grapevine_staff', 'gsb_officers'):
        for t in d.get(k) or []:
            names.append((k, t.get('name')))
        if not d.get(k):
            W.append(f'{k} empty')

    # anonymity format
    bad = sorted({f'{w}: {n!r}' for w, n in names if n and not name_ok(n)})
    for b in bad:
        E.append('ANONYMITY/name format: ' + b)
    sfx = sorted({n for _, n in names if n and SUFFIX.search(n)})
    for s in sfx:
        E.append('professional suffix in name: ' + s)

    W = [w for w in W if w]
    print(f'== {path}: year {y}, delegates {len(dels)}, committees {len(cc)}, '
          f"trustees {len(d.get('trustees') or [])}, trustees_committees {len(d.get('trustees_committees') or [])}")
    for e in E:
        print('ERROR  ', e)
    for w in W:
        print('WARNING', w)
    print(f'{len(E)} ERRORS, {len(W)} WARNINGS')
    return len(E)


if __name__ == '__main__':
    errs = sum(main(p) for p in sys.argv[1:])
    sys.exit(1 if errs else 0)
