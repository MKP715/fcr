"""Merge Panel-NN delegate-elect findings into data/src/panel_elects.json.
Usage: python -X utf8 tools/dev/merge_panel_elects.py <findings.json | workflow journal.jsonl> [--as-of YYYY-MM-DD]
Accepts a JSON list of {area, panel77_delegate, panel77_alternate, status, election_date, source_url, confidence, notes}
or a workflow journal (every agent result with an "areas" list is read).
Rules: user_provided entries are never overwritten; an 'elected' finding with a source beats any non-elected entry;
otherwise a newer finding only replaces an older one when it is more specific (scheduled/held > unknown)."""
import json
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RANK = {'unknown': 0, 'election_scheduled': 1, 'held_results_not_found': 2, 'elected': 3}


def load_findings(path):
    if path.endswith('.jsonl'):
        out = []
        for line in open(path, encoding='utf-8'):
            try:
                j = json.loads(line)
            except ValueError:
                continue
            r = j.get('result')
            if j.get('type') == 'result' and isinstance(r, dict) and isinstance(r.get('areas'), list):
                out += r['areas']
            elif j.get('type') == 'result' and isinstance(r, list):
                out += [x for x in r if isinstance(x, dict) and 'area' in x]
        return out
    data = json.load(open(path, encoding='utf-8'))
    return data['areas'] if isinstance(data, dict) else data


def main():
    findings = load_findings(sys.argv[1])
    as_of = sys.argv[sys.argv.index('--as-of') + 1] if '--as-of' in sys.argv else None
    p = os.path.join(ROOT, 'data', 'src', 'panel_elects.json')
    doc = json.load(open(p, encoding='utf-8'))
    cur = {x['area']: x for x in doc['areas']}
    changed = []
    for f in findings:
        a = f.get('area')
        if a not in cur:
            continue
        old = cur[a]
        if old.get('user_provided'):
            continue
        new_rank = RANK.get(f.get('status'), 0)
        old_rank = RANK.get(old.get('status'), 0)
        if f.get('status') == 'elected' and not (f.get('panel77_delegate') and f.get('source_url')):
            continue  # only accept a name with a source
        if new_rank > old_rank or (new_rank == old_rank == RANK['elected'] and f.get('confidence') == 'high' and old.get('confidence') != 'high'):
            keep = {k: old.get(k) for k in ('area_name',)}
            old.update({k: v for k, v in f.items() if v not in (None, '')})
            old.update({k: v for k, v in keep.items() if v})
            changed.append((a, old.get('status'), old.get('panel77_delegate')))
    if as_of:
        doc['as_of'] = as_of
    json.dump(doc, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    from collections import Counter
    print('changed:', changed)
    print('status counts:', dict(Counter(x['status'] for x in doc['areas'])))


if __name__ == '__main__':
    main()
