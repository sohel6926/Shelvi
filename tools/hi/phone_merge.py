#!/usr/bin/env python3
"""Builds app/src/main/assets/hi.json and hi-patterns.json for the phone app from the texts the app really uses
(L(...) calls and the tr() map) and the Hindi we have: web/src/i18n/hi*.json plus tools/hi/phone/batch*.json (texts)
and pbatch*.json (patterns). Run after adding a batch; then python3 tools/hi/phone_extract.py shows what is missing."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from phone_extract import collect, have_static, have_patterns, ROOT
stat, pats = collect()
hs, hp = have_static(), have_patterns()
out_s = {k: hs[k] for k in sorted(stat) if k in hs}
# a list of [english, hindi] — longest fixed text first, so a specific pattern wins over a general one (JSON objects are unordered on Android)
out_p = [[k, hp[k]] for k in sorted((k for k in pats if k in hp), key=lambda k: -len(re.sub(r'\{\d\}', '', k)))]
d = os.path.join(ROOT, 'app/src/main/assets')
json.dump(out_s, open(os.path.join(d, 'hi.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
json.dump(out_p, open(os.path.join(d, 'hi-patterns.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(out_s), 'texts,', len(out_p), 'patterns; missing', len(stat) - len(out_s), 'texts,', len(pats) - len(out_p), 'patterns')
