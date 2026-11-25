#!/usr/bin/env python3
"""Reads the corrected docs/hindi-review.csv and writes every changed Hindi text back into the batch files
(tools/hi/batch*.json, tools/hi/phone/*batch*.json, web/src/i18n/hi-patterns.json), then run:
python3 tools/hi/merge.py && python3 tools/hi/phone_merge.py. Run from the project folder."""
import json, csv, glob
new = {r['English']: r['Hindi'] for r in csv.DictReader(open('docs/hindi-review.csv', encoding='utf-8-sig')) if r['Hindi'].strip()}
files = sorted(glob.glob('tools/hi/batch*.json')) + sorted(glob.glob('tools/hi/phone/*batch*.json')) + ['web/src/i18n/hi-patterns.json']
changed = 0
for f in files:
    d = json.load(open(f, encoding='utf-8')); n = 0
    for k, v in d.items():
        if k in new and new[k] != v:
            d[k] = new[k]; n += 1
    if n:
        json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=0); changed += n
print(changed, 'texts changed')
