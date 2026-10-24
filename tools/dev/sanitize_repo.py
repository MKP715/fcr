"""Privacy pass on repo data: reduce known full names in free text to "First L." form; replace local paths with Drive file names.

Usage: python -X utf8 tools/dev/sanitize_repo.py <repo root> [--dry-run]   (--dry-run reports what would change, writes nothing)

The full names to reduce are kept only as SHA-256 prefixes, so the names themselves never appear in the repo.
To add one: python -c "import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest()[:20])" "First Last"
The reduced form keeps every word but the last and shortens the last word to its initial
("Terrance M. Bedient" -> "Terrance M. B."; "John D. Rockefeller, Jr." -> "John D. R., Jr.").
"""
import glob
import hashlib
import json
import os
import re
import sys

FULL_NAME_HASHES = {
    '08dd246500e6816ce668', '106075acaa54414a18b3', '1102d7439bc8c15bd28e', 'b39532c0b6ca96a23fb7',
    '1adb5e8a62155109ac40', 'ba5fe582156ca7c3e71d', 'a9270d32f29d7045cd74', 'f0ea6ed6f8a891d3c0a0',
    '3fa3929455df106ed38f', '97b61767f009580839a7', '719c03d17a155453a69a', 'f0f13c48a4720a9c3f2f',
}
L = r"[^\W\d_]"  # any letter, accented ones included
NAME = re.compile(rf"{L}+(?: \({L}+\))?(?: [A-Z]\.)* [A-Z][\w'\-]*{L}")


def reduce_names(text):
    """Replace every listed full name in text with its "First L." form; returns (text, count)."""
    out, last, n = [], 0, 0
    for m in re.finditer(rf"(?<!\w){L}", text):
        i = m.start()
        if i < last or not text[i].isupper():
            continue
        nm = NAME.match(text, i)
        if not nm:
            continue
        full = nm.group(0)
        if hashlib.sha256(full.encode('utf-8')).hexdigest()[:20] not in FULL_NAME_HASHES:
            continue
        head, tail = full.rsplit(' ', 1)
        out.append(text[last:i] + head + ' ' + tail[0] + ('' if text[nm.end():nm.end() + 1] == '.' else '.'))
        last, n = nm.end(), n + 1
    out.append(text[last:])
    return ''.join(out), n


args = [a for a in sys.argv[1:] if not a.startswith('-')]
flags = [a for a in sys.argv[1:] if a.startswith('-')]
if len(args) != 1 or not os.path.isdir(args[0]) or any(f != '--dry-run' for f in flags):
    print(__doc__ or 'usage: python -X utf8 tools/dev/sanitize_repo.py <repo root> [--dry-run]')
    sys.exit(2)
DRY = '--dry-run' in flags   # report what would change, write nothing
root = args[0]
os.chdir(root)
total = 0

# free-text data files: edit the text in place (no re-serialisation, so formatting is untouched)
for p in sorted(glob.glob('data/src/*.json')):
    s = open(p, encoding='utf-8', newline='').read()
    t, n = reduce_names(s)
    if n:
        if not DRY:
            open(p, 'w', encoding='utf-8', newline='').write(t)
        print(f'{p}: {n} full name(s) reduced')
        total += n

lib = {r['year']: r['file_name'] for r in json.load(open('data/src/reports.json', encoding='utf-8'))}
for f in sorted(glob.glob('data/src/years/*.json')):
    d = json.load(open(f, encoding='utf-8'))
    src = d.get('source') or {}
    fn = src.get('file') or ''
    if '/' in fn or chr(92) in fn:
        src['file'] = lib.get(d['year'], fn.replace(chr(92), '/').split('/')[-1])
    txt = json.dumps(d, ensure_ascii=False)
    # also scrub local paths inside free-text notes
    if 'C:/Users' in txt or 'AppData' in txt:
        txt = re.sub(r'C:/Users/[^"\s]*', '[local scratch file]', txt)
    txt, n = reduce_names(txt)
    if n:
        print(f'{f}: {n} full name(s) reduced')
        total += n
    out = json.dumps(json.loads(txt), ensure_ascii=False, indent=1)
    # write only on a change, so an unchanged file keeps its mtime (precompute_forecast --check compares mtimes)
    if out != open(f, encoding='utf-8').read().rstrip('\n'):   # text mode reads CRLF as \n
        if DRY:
            print(f'{f}: would be rewritten')
        else:
            open(f, 'w', encoding='utf-8').write(out)
print(f"{'dry run: ' if DRY else ''}sanitized ({total} full names reduced)")
