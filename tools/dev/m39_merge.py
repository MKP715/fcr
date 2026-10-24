"""Merge the per-job M-39 extractions into data/src/advisory_actions.json.

M-39 = "Advisory Actions of the General Service Conference of Alcoholics Anonymous 1951-2026" (GSO, (c) AAWS). The app's
repo is public, so the merged file holds only an index — year, section, page, a summary in our own words, tags and
follow-up dates — never the original wording, which stays in the PDF (aa.org and the user's Drive copy).

Pipeline (scratch dir, not in the repo): text pre-segmentation by PDF layout (paragraphs numbered, cut into jobs), one
extraction per job (actions = groups of paragraphs + own-words summary), checked by m39_check.py, then this merge.
Usage: python -X utf8 tools/dev/m39_merge.py <scratch m39 dir>   -> data/src/advisory_actions.json
"""
import glob
import re
import json
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
D = sys.argv[1]

# sections of M-39 (sid = order in the booklet): short name, current Conference committee id (FCR.COMMITTEES) or None
SECTIONS = [
    ('Agenda', 'AGENDA', 'committee'), ('Archives', 'ARCHIVES', 'committee'),
    ('Cooperation with the Professional Community', 'CPC', 'committee'), ('Finance', 'FINANCE', 'committee'),
    ('Grapevine and La Viña', 'GRAPEVINE', 'committee'), ('Institutions', None, 'historical'),
    ('Correctional Facilities', 'CORRECTIONS', 'committee'), ('Treatment Facilities/Accessibilities', 'TREATMENT', 'committee'),
    ('International Conventions/Regional Forums', 'ICRF', 'committee'), ('Literature', 'LITERATURE', 'committee'),
    ('Policy and Admissions', 'POLICY', 'committee'), ('Public Information', 'PI', 'committee'),
    ('Report and Charter', 'REPORT', 'committee'), ('Trustees', 'TRUSTEES', 'committee'),
    ('Al-Anon Family Groups', None, 'general'), ('Clubs', None, 'general'), ('Conference Committees', None, 'general'),
    ('Delegates and Delegates-Only Meetings', None, 'general'), ('Directories', None, 'general'),
    ('Films, Filmstrips and Videos', None, 'general'), ('The General Service Office', None, 'general'),
    ('General Service Representatives and Groups', None, 'general'), ('Other Important Matters', None, 'general'),
    ('Other Countries and World Service Meetings', None, 'general'),
]

# M-39 prints a trailing committee tag "(Policy)" in several spellings over 75 years; one name per committee or meeting
CROSS = {'Literature Committee': 'Literature', 'Policy Committee': 'Policy', 'Agenda Committee': 'Agenda',
         'Report and Charter Committee': 'Report and Charter', 'Conference Report and Charter Committee': 'Report and Charter',
         'Policy/ Admissions': 'Policy/Admissions', 'Delegates’ Only Meeting': 'Delegates Only Meeting',
         "Delegates' Only Meeting": 'Delegates Only Meeting', 'Relations With Other Agencies': 'Relations with Other Agencies',
         'C.P.C.': 'Cooperation with the Professional Community'}


def cross_name(s):
    s = re.sub(r'\s+', ' ', s.strip().strip('()').strip())
    return CROSS.get(s, s)


P = json.load(open(os.path.join(D, 'paras.json'), encoding='utf-8'))
first_page = {}
for p in P['paras']:
    first_page.setdefault(p['sid'], p['page'])
actions = []
for f in sorted(glob.glob(os.path.join(D, 'out', 'job*.json'))):
    out = json.load(open(f, encoding='utf-8'))
    for a in out['actions']:
        actions.append(a)
# document order: section, then year, then the first paragraph number
actions.sort(key=lambda a: (a['sid'], a['year'], min(a['paras'])))
# A year heading the layout pass missed leaves its actions under the previous year; the extraction then marks the summary
# "(2007 action) …" (its checker ties each action to the heading year), and the year is put right here.
for a in actions:
    m = re.match(r'^\((1[89]\d\d|20\d\d) action\)\s*', a['summary'])
    if m:
        a['year'], a['summary'] = int(m.group(1)), a['summary'][m.end():]
actions.sort(key=lambda a: (a['sid'], a['year'], min(a['paras'])))
rows = []
for i, a in enumerate(actions):
    # id = first paragraph number of the pre-segmented text: stable across re-merges (data/src/followups.json refers to it)
    r = {'id': f'p{min(a["paras"])}', 'year': a['year'], 'sec': a['sid'], 'page': a['page'], 'text': a['summary'].strip()}
    if a.get('kind') == 'floor':
        r['floor'] = True
    if a.get('noaction'):
        r['noaction'] = True
    if a.get('cross'):
        r['cross'] = cross_name(a['cross'])
    if a.get('topics'):
        r['tags'] = a['topics']
    # during: dated to a year but not to that year's Conference (e.g. an International Convention with no date yet)
    due = [{k: v for k, v in d.items() if k in ('year', 'month', 'what', 'during') and v not in (None, '', False)} for d in a.get('due') or []]
    if due:
        r['due'] = due
    rows.append(r)
dups = sorted(k for k, n in __import__('collections').Counter(r['id'] for r in rows).items() if n > 1)
assert not dups, f'duplicate action ids: {dups}'
data = {
    'source': {
        'title': 'Advisory Actions of the General Service Conference of Alcoholics Anonymous 1951–2026',
        'item': 'M-39', 'edition': '9/26 online', 'pages': 228, 'years': [1951, 2026],
        'public_url': 'https://www.aa.org/sites/default/files/literature/M-39_Advisory_Actions_ONLINE_0525.pdf',
        'drive_url': 'https://drive.google.com/file/d/1MogdezJM-O5QygvpMI3EU4D1EI9lJLre/view',
        'note': 'Summaries are written for this app in plain words; the original wording is in the PDF (open the page link).',
    },
    'sections': [{'sid': i, 'name': n, 'committee': c, 'kind': k, 'page': first_page.get(i)} for i, (n, c, k) in enumerate(SECTIONS)],
    'actions': rows,
}
dst = os.path.join(ROOT, 'data', 'src', 'advisory_actions.json')
with open(dst, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print(f'wrote {dst}: {len(rows)} actions in {len(SECTIONS)} sections; floor {sum(1 for r in rows if r.get("floor"))}, '
      f'not adopted {sum(1 for r in rows if r.get("noaction"))}, cross-listed {sum(1 for r in rows if r.get("cross"))}, '
      f'with follow-ups {sum(1 for r in rows if r.get("due"))}')
