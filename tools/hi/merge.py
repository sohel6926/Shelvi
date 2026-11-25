#!/usr/bin/env python3
"""Merges tools/hi/batch*.json into web/src/i18n/hi.json (sorted). Run from the project folder."""
import json, glob
out = {}
for f in sorted(glob.glob('tools/hi/batch*.json')):
    d = json.load(open(f, encoding='utf-8'))
    out.update({k: v for k, v in d.items() if isinstance(v, str) and v.strip()})
json.dump(dict(sorted(out.items())), open('web/src/i18n/hi.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(out), 'Hindi strings')
