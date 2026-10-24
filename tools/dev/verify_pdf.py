"""Usage: python -P -E verify_pdf.py <pdf_path> [<pdf_path>...]
Prints a JSON summary per PDF: pages, has_text, detected year/ordinal, US/Canada GSC markers, roster sections present."""
import sys, json, re, os
import fitz
ORD = r'(\d{2})(?:st|nd|rd|th)'
WORDS = ['Fiftieth','Fifty','Sixtieth','Sixty','Seventieth','Seventy']
for path in sys.argv[1:]:
    r = {'path': path, 'bytes': os.path.getsize(path)}
    try:
        d = fitz.open(path)
    except Exception as e:
        r['error'] = 'not a readable PDF: %s' % e; print(json.dumps(r)); continue
    r['pages'] = d.page_count
    r['meta_title'] = (d.metadata or {}).get('title')
    texts = []
    for i, p in enumerate(d):
        try: texts.append(p.get_text())
        except Exception: texts.append('')
    full = '\n'.join(texts)
    r['text_chars'] = len(full)
    r['has_text'] = len(full) > 20000
    head = '\n'.join(texts[:4])
    r['head_snippet'] = re.sub(r'\s+', ' ', head)[:600]
    years = re.findall(r'\b(19[5-9]\d|20[0-3]\d)\b', head)
    r['years_in_head'] = sorted(set(years))
    m = re.search(ORD + r'\s+(?:Annual Meeting|General Service Conference)', head)
    r['ordinal_in_head'] = m.group(1) if m else None
    m2 = re.search(r'The\s+([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\s+Annual Meeting', head)
    r['ordinal_words'] = m2.group(1) if m2 else None
    low = full.lower()
    r['us_canada_markers'] = {
        'riverside_or_aaws': ('475 riverside' in low) or ('alcoholics anonymous world services' in low) or ('468 park avenue' in low),
        'area_delegates': 'area delegates' in low,
        'conference_committees': 'conference committees' in low,
        'trustees_committees': ("trustees' committees" in low) or ('trustees’ committees' in low),
        'chairpersons_and_alternates': ('chairpersons and alternate' in low) or ('chairs and alternate' in low),
        'great_britain': 'great britain' in low and 'york' in low and 'general service board of alcoholics anonymous (great britain)' in low,
    }
    r['secretary_count'] = full.count('Secretary:')
    r['area_dash_count'] = len(re.findall(r'Area\s+\d{1,2}\b', full))
    r['language_hint'] = 'fr' if low.count(' le ') > low.count(' the ') else ('es' if low.count(' el ') > low.count(' the ') else 'en')
    print(json.dumps(r, ensure_ascii=False))
