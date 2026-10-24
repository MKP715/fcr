import json, glob, os, sys, re
from collections import defaultdict, Counter
D = sys.argv[1]
Y = {}
for p in sorted(glob.glob(os.path.join(D, '*.json'))):
    d = json.load(open(p, encoding='utf-8')); Y[d['year']] = d
def first(n): return re.sub(r'\(.*?\)', '', n or '').split()[0].lower() if n else ''
def nick(n):
    m = re.search(r'\((.*?)\)', n or ''); return m.group(1).lower() if m else None
def same(a, b):
    if not a or not b: return False
    la, lb = (a.split()[-1][0], b.split()[-1][0])
    fa = {first(a), nick(a)} - {None}; fb = {first(b), nick(b)} - {None}
    return la == lb and bool(fa & fb)
issues = []
# terms
prim = {}
for y, d in Y.items():
    for c in d['conference_committees']:
        if c.get('secondary'): continue
        for m in c['members']:
            if m.get('area') is not None: prim[(y, m['area'])] = (c['committee'], m['name'], m.get('panel'), m.get('role'))
dels = {(y, x['area']): x for y, d in Y.items() for x in d['delegates']}
for (y, a), x in dels.items():
    if (y + 1, a) in dels:
        nx = dels[(y + 1, a)]
        if x['panel'] == nx['panel']:
            if not same(x['name'], nx['name']): issues.append(f'NAME  A{a} P{x["panel"]}: {y} {x["name"]!r} vs {y+1} {nx["name"]!r}')
            c1 = prim.get((y, a), (None,))[0]; c2 = prim.get((y + 1, a), (None,))[0]
            if c1 != c2: issues.append(f'COMM  A{a} P{x["panel"]}: {y} {c1} vs {y+1} {c2}')
    # parity
par = defaultdict(set)
for (y, a), x in dels.items(): par[a].add(x['panel'] % 2)
for a, s in par.items():
    if len(s) > 1: issues.append(f'PARITY area {a} has both parities')
# next-year chairs vs actual
for y, d in Y.items():
    if y + 1 not in Y: continue
    nd = Y[y + 1]
    for nc in d.get('next_year_chairs') or []:
        c = next((c for c in nd['conference_committees'] if c['committee'] == nc['committee']), None)
        if not c: issues.append(f'CHAIRS {y}->{y+1} committee {nc["committee"]} missing next year'); continue
        ch = [m for m in c['members'] if m.get('role') == 'chair']; al = [m for m in c['members'] if m.get('role') == 'alt_chair']
        if nc.get('chair') and (not ch or ch[0].get('area') != nc['chair'].get('area')):
            issues.append(f'CHAIR {nc["committee"]} {y+1}: elected {nc["chair"]} vs roster {[(m["name"], m["area"]) for m in ch]}')
        if nc.get('alternate') and (not al or al[0].get('area') != nc['alternate'].get('area')):
            issues.append(f'ALT   {nc["committee"]} {y+1}: elected {nc["alternate"]} vs roster {[(m["name"], m["area"]) for m in al]}')
for i in issues: print(i)
print(len(issues), 'issues')
# summary: committees by year
for y, d in sorted(Y.items()):
    print(y, 'committees:', ' '.join(f"{c['committee']}{'*' if c.get('secondary') else ''}:{len(c['members'])}" for c in d['conference_committees']))
