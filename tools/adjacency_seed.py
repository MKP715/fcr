"""Which of the 93 areas border each other (land borders, plus short water crossings such as the Detroit and
Niagara rivers and the St. Lawrence). Pure four-corner touches are not counted. Verified against SMF-146
(Area Map of the U.S. and Canada) — see RESUME.md. Writes data/src/adjacency.json.
Usage: python tools/adjacency_seed.py [--check]   (--check prints distance outliers for review)"""
import json
import math
import os
import sys

# Each entry: (area, neighbours). An area may appear several times; the result is made symmetric below.
PAIRS = [
    # --- multi-area states / provinces: internal borders ---
    (5, [9, 93]),                       # Southern CA (LA area) – Mid-Southern, Central CA
    (6, [7, 93]),                       # Northern Coastal – Northern Interior, Central
    (7, [93]),
    (8, [9]),                           # San Diego/Imperial – Mid-Southern
    (9, [93]),
    (65, [66, 67, 68]),                 # Texas
    (66, [68]),
    (67, [68]),
    (47, [48, 49, 50]),                 # New York
    (48, [49]),
    (59, [60]),                         # Pennsylvania
    (53, [54, 55, 56]),                 # Ohio
    (54, [55]),
    (55, [56]),
    (19, [20]),                         # Illinois
    (20, [21]),
    (22, [23]),                         # Indiana
    (32, [33, 34]),                     # Michigan (Lower Peninsula)
    (34, [74]),                         # northern Lower Peninsula – Upper Peninsula (Straits of Mackinac)
    (74, [75]),                         # Wisconsin
    (35, [36]),                         # Minnesota
    (38, [39]),                         # Missouri
    (1, [14]),                          # NW Florida – North Florida
    (14, [15]),
    (72, [92]),                         # Washington
    (44, [45]),                         # New Jersey
    (30, [31]),                         # Massachusetts
    (83, [84, 86]),                     # Ontario
    (84, [85, 86]),
    (87, [88, 89, 90]),                 # Quebec
    (88, [89]),
    (89, [90]),
    # --- borders between states / provinces ---
    (1, [14, 16, 37, 64]),
    (2, [79]),
    (3, [8, 9, 42, 46, 69]),
    (4, [27, 37, 38, 39, 57, 64, 65]),
    (6, [7, 58, 93]),
    (7, [42, 58, 93]),
    (9, [3, 42]),
    (93, [42]),
    (8, [3]),
    (10, [25, 41, 46, 57, 69, 76]),
    (11, [30, 31, 48, 49, 61]),
    (12, [29, 45, 59]),
    (13, [29, 71]),
    (14, [16]),
    (16, [51, 62, 64]),
    (18, [40, 42, 58, 69, 76, 79, 92]),
    (19, [22]),
    (20, [22, 24, 75]),
    (21, [23, 24, 26, 38]),
    (22, [34, 32, 55]),
    (23, [26, 56]),
    (24, [36, 38, 39, 41, 63, 75]),
    (25, [39, 41, 57]),
    (26, [38, 53, 56, 64, 71, 73]),
    (27, [37, 65, 67]),
    (28, [43, 81, 88, 89]),
    (29, [59, 60, 71, 73]),
    (31, [43, 48, 70]),
    (30, [43, 61]),
    (33, [55, 86]),
    (35, [52, 74, 80, 85]),
    (36, [52, 63, 75]),
    (37, [64]),
    (38, [64]),
    (39, [41, 57]),
    (40, [52, 63, 76, 78, 79, 91]),
    (41, [63, 76]),
    (42, [58, 69]),
    (43, [70, 88]),
    (44, [49, 59]),
    (45, [59]),
    (46, [57, 66, 68, 69]),
    (47, [59, 60, 83]),
    (48, [70, 87]),
    (49, [59]),
    (50, [60, 86]),
    (51, [62, 64, 71]),
    (52, [63, 80, 91]),
    (53, [60, 73]),
    (54, [60]),
    (57, [65, 66]),
    (58, [72, 92]),
    (60, [73]),
    (63, [76]),
    (64, [71]),
    (69, [76]),
    (70, [87, 88]),
    (71, [73]),
    (72, [79]),
    (78, [79, 91]),
    (79, [92]),
    (80, [85, 91]),
    (81, [82, 88, 89]),
    (82, [89]),
    (83, [87, 90]),
    (84, [90]),
]

# Corrections from checking every pair against SMF-146 (vector paths + 300-4800 dpi renders), 2026-10-20.
SMF146_ADD = [
    (40, 92),  # Area 92 includes the Idaho panhandle and a corner of NW Montana
    (78, 80),  # mainland Nunavut is labelled 78; it borders Manitoba along 60N
    (78, 90),  # WCAN/ECAN line through Nunavut: 78 west, 90 (Baffin Island) east — remote Arctic contact
    (35, 63),  # 35/36 line meets Minnesota's west border south of the ND/SD/MN corner (Lake Traverse)
    (7, 9),    # east of the 93/9 junction, 7 lies directly north of 9 (eastern California)
    (21, 22),  # Illinois 20/21 line meets Indiana north of Indiana's 22/23 line
    (22, 56),  # Ohio 55/56 line meets Indiana north of Indiana's 22/23 line
    (32, 55),  # 32 touches the Michigan-Ohio line east of the MI/IN/OH tripoint
    (36, 74),  # St. Croix: Wisconsin's 74/75 line starts well south of Minnesota's 35/36 line
    (54, 73),  # NE Ohio faces the WV northern panhandle along the Ohio River
    (34, 84),  # the map labels the eastern Upper Peninsula tip 34; it faces Sault Ste. Marie, Ontario
    (48, 59),  # 47/48 line meets the NY-PA border west of where the 48/49 line starts
    (48, 83),  # northern NY along the St. Lawrence (Thousand Islands to 45N) is 48, facing Eastern Ontario
]
SMF146_REMOVE = [
    (46, 69),  # Four Corners touch only
    (46, 68),  # El Paso / trans-Pecos is Area 66; New Mexico borders only 66 in Texas
    (18, 79),  # the Idaho panhandle (Area 92) is the only Idaho land on the BC border
    (36, 52),  # all of Minnesota's ND border is Area 35
    (42, 93),  # the Nevada-42 strip of eastern California touches 7 and 9, not 93
    (22, 32),  # Michigan's whole Indiana border is Area 34
    (53, 60),  # Ohio's whole PA border is Area 54
    (47, 49),  # Area 48 lies between 47 and 49 along the PA border
    (28, 89),  # Quebec's south shore / Gaspé is Area 88
    (81, 89),  # New Brunswick faces the south shore / Gaspé (88); 89 is north of the estuary
    (87, 89),  # Quebec's two dividing lines cross in an X: 87 and 89 are opposite corners
]

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


def build():
    adj = {n: set() for n in range(1, 94)}
    for a, ns in PAIRS + [(a, [b]) for a, b in SMF146_ADD]:
        for b in ns:
            if a == b:
                continue
            adj[a].add(b)
            adj[b].add(a)
    for a, b in SMF146_REMOVE:
        adj[a].discard(b)
        adj[b].discard(a)
    return adj


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a['lat'], a['lng'], b['lat'], b['lng']))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def main():
    adj = build()
    out = {'source': 'Land borders (plus short water crossings) between the 93 areas; corner-only touches excluded. '
                     'Built from state/province borders and the SMF-146 area map.',
           'pairs': sorted([a, b] for a in adj for b in adj[a] if a < b)}
    json.dump(out, open(os.path.join(ROOT, 'data', 'src', 'adjacency.json'), 'w', encoding='utf-8'), indent=1)
    print(f"{len(out['pairs'])} neighbour pairs; areas with no neighbours: {[a for a in adj if not adj[a]]}")
    if '--check' in sys.argv:
        areas = {a['n']: a for a in json.load(open(os.path.join(ROOT, 'data', 'src', 'areas.json'), encoding='utf-8'))['areas']}
        far = sorted(((km(areas[a], areas[b]), a, b) for a, b in out['pairs']), reverse=True)[:15]
        print('Farthest listed neighbours (km between approximate centres):')
        for d, a, b in far:
            print(f'  {a:>2} {areas[a]["short"]:<22} {b:>2} {areas[b]["short"]:<22} {d:6.0f}')
        pairset = set(map(tuple, out['pairs']))
        near = sorted((km(areas[a], areas[b]), a, b) for a in range(1, 94) for b in range(a + 1, 94) if (a, b) not in pairset)[:20]
        print('Closest pairs NOT listed as neighbours:')
        for d, a, b in near:
            print(f'  {a:>2} {areas[a]["short"]:<22} {b:>2} {areas[b]["short"]:<22} {d:6.0f}')


if __name__ == '__main__':
    main()
