#!/usr/bin/env python3
"""Writes docs/hindi-review.csv (English, Hindi, where) — all Hindi texts and patterns of the web and phone app, for a Hindi
speaker to read and correct. Only the Hindi column should be edited. Run from the project folder."""
import json, csv
web = json.load(open('web/src/i18n/hi.json', encoding='utf-8')); wp = json.load(open('web/src/i18n/hi-patterns.json', encoding='utf-8'))
ph = json.load(open('app/src/main/assets/hi.json', encoding='utf-8')); pp = dict(json.load(open('app/src/main/assets/hi-patterns.json', encoding='utf-8')))
rows = {}
for src, d in (('web', {**web, **wp}), ('phone', {**ph, **pp})):
    for k, v in d.items():
        r = rows.setdefault(k, [v, set()]); r[1].add(src)
with open('docs/hindi-review.csv', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f); w.writerow(['English', 'Hindi', 'Where'])
    for k in sorted(rows, key=str.lower): w.writerow([k, rows[k][0], '+'.join(sorted(rows[k][1]))])
print(len(rows), 'rows')
