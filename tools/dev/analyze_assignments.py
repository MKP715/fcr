"""Committee-assignment statistics behind the Predict page (re-run after adding a year).
Usage: python tools/dev/analyze_assignments.py            (from the repo root)
Prints: committee sizes per panel, seat-replacement test, repeat rates by terms back, regional duplicates,
secondary-committee regions, and a chi-square test of committee-to-committee transitions."""
import glob
import json
import os
from collections import Counter, defaultdict

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
REG = {a['n']: a['region'] for a in json.load(open(os.path.join(ROOT, 'data/src/areas.json'), encoding='utf-8'))['areas']}
Y = {}
for p in sorted(glob.glob(os.path.join(ROOT, 'data/src/years/*.json'))):
    d = json.load(open(p, encoding='utf-8'))
    Y[d['year']] = d

term, sec = {}, defaultdict(set)
for y, d in sorted(Y.items()):
    for c in d['conference_committees']:
        for m in c['members']:
            if m.get('area') is None or not m.get('panel'):
                continue
            if c.get('secondary'):
                sec[(m['area'], m['panel'])].add(c['committee'])
            else:
                term.setdefault((m['area'], m['panel']), c['committee'])
panels = sorted({p for _, p in term})
C = sorted(set(term.values()))
size = defaultdict(Counter)
for (a, p), c in term.items():
    size[p][c] += 1

print('Panels:', panels)
print('\nNew members per committee per panel')
print('      ' + ' '.join(f'{c[:5]:>5}' for c in C))
for p in panels:
    print(f'P{p}: ' + ' '.join(f'{size[p][c]:>5}' for c in C), ' total', sum(size[p].values()))

print('\nSeat replacement (size(P,c) == size(P-2,c))')
for p in panels:
    if p - 2 in size:
        eq = sum(size[p][c] == size[p - 2][c] for c in C)
        print(f'  P{p}: {eq}/{len(C)}', {c: (size[p - 2][c], size[p][c]) for c in C if size[p][c] != size[p - 2][c]})

print('\nSame committee as the area delegate k terms earlier (random ~ n/11)')
for k in (1, 2, 3, 4):
    n = s = 0
    for (a, p), c in term.items():
        if (a, p - 2 * k) in term:
            n += 1
            s += term[(a, p - 2 * k)] == c
    print(f'  k={k}: {s}/{n} (random ~{n / 11:.1f})')

dup = tot = 0
for p in panels:
    bc = defaultdict(list)
    for (a, pp), c in term.items():
        if pp == p:
            bc[c].append(REG[a])
    for regs in bc.values():
        tot += 1
        dup += len(set(regs)) < len(regs)
print(f'\nCommittee-panels with two new members from one region: {dup}/{tot}')

print('\nSecondary committee regions (outgoing vs new)')
for y in sorted(Y):
    for sc in ('ICRF', 'ARCHIVES'):
        old = sorted(REG[a] for (a, p), s in sec.items() if sc in s and p == y - 1951)
        new = sorted(REG[a] for (a, p), s in sec.items() if sc in s and p == y - 1950)
        print(f'  {y} {sc:8} P{y - 1951}: {old}  P{y - 1950}: {new}')

T = defaultdict(Counter)
for (a, p), c in term.items():
    if (a, p - 2) in term:
        T[term[(a, p - 2)]][c] += 1
chi = 0.0
df = 0
for c1 in C:
    n = sum(T[c1].values())
    exp = n / (len(C) - 1)
    for c2 in C:
        if c2 != c1 and exp:
            chi += (T[c1][c2] - exp) ** 2 / exp
            df += 1
print(f'\nTransition chi-square vs uniform over the other committees: {chi:.1f} on ~{df - len(C)} df')
