"""File a new Final Report into the Drive library and register it in the app.
Usage: python -X utf8 tools/dev/add_report.py <pdf> <year> "<theme>" <Confidential|Anonymity-Protected> [--drive-url URL]
- copies the PDF to Drive as 'YYYY - NNth GSC Final Report - Theme (Edition).pdf' (SHA-1 verified)
- writes a text extraction to '_GSC Explorer Data/text/reports/YYYY Final Report (text).txt'
- adds/updates the entry in data/src/reports.json
Next steps (see RESUME.md "Adding a new year"): extract rosters to data/src/years/YYYY.json per tools/YEAR_SCHEMA.md,
validate, audit, build, render-test, privacy scan, commit."""
import hashlib
import json
import os
import re
import shutil
import sys

import fitz  # PyMuPDF

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
DRIVE = 'G:/My Drive/RowlettAATech/Literature_Archive/Final Conference Reports'


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def clean(s):
    s = re.sub(r'^\d{4}:\s*', '', s or '').replace(':', ' -')
    return re.sub(r'[\\/?*"<>|]', '-', re.sub(r'\s+', ' ', s)).strip()


def sha(p):
    h = hashlib.sha1()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def main():
    pdf, year, theme, edition = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
    drive_url = sys.argv[sys.argv.index('--drive-url') + 1] if '--drive-url' in sys.argv else ''
    name = f'{year} - {ordinal(year - 1950)} GSC Final Report - {clean(theme)} ({edition}).pdf'
    dest = os.path.join(DRIVE, name)
    if not os.path.exists(dest):
        shutil.copy2(pdf, dest)
        assert sha(pdf) == sha(dest), 'copy verification failed'
    doc = fitz.open(dest)
    txt_dir = os.path.join(DRIVE, '_GSC Explorer Data', 'text', 'reports')
    os.makedirs(txt_dir, exist_ok=True)
    with open(os.path.join(txt_dir, f'{year} Final Report (text).txt'), 'w', encoding='utf-8') as f:
        for i, page in enumerate(doc):
            f.write(f'\n=====PAGE {i + 1}=====\n' + page.get_text())
    p = os.path.join(ROOT, 'data', 'src', 'reports.json')
    lib = json.load(open(p, encoding='utf-8'))
    lib = [r for r in lib if r['year'] != year]
    lib.append({'year': year, 'ordinal': year - 1950, 'theme': theme, 'dates': '', 'location': '', 'file_name': name,
                'edition': edition, 'source_url': '', 'source_note': 'added with tools/dev/add_report.py',
                'pages': doc.page_count, 'drive_url': drive_url})
    lib.sort(key=lambda r: -r['year'])
    json.dump(lib, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('filed', name, f'({doc.page_count} pages); text extracted; reports.json updated')


if __name__ == '__main__':
    main()
