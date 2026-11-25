#!/usr/bin/env python3
"""Lists the English strings of the web app that have no Hindi yet (web/src/i18n/hi.ts), most used first.
Usage: python3 tools/extract-i18n.py [--all]   → prints JSON list of [count, english]"""
import re, glob, json, sys, collections
STR = r'("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)'
cnt = collections.Counter()
templ = collections.Counter()
for f in glob.glob('web/src/**/*.ts*', recursive=True):
    if f.endswith('i18n/hi.ts'): continue
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'\bL\(\s*' + STR + r'\s*,\s*' + STR + r'\s*,?\s*\)', s):
        en = m.group(2)
        (templ if '${' in en else cnt)[json.loads(en) if en[0] == '"' else en[1:-1]] += 1
    for m in re.finditer(r'\ben:\s*("(?:[^"\\]|\\.)*")', s):
        cnt[json.loads(m.group(1))] += 1
have = {}
try:
    have = json.load(open('web/src/i18n/hi.json', encoding='utf-8'))
except FileNotFoundError:
    pass
todo = [(c, k) for k, c in cnt.most_common() if k.strip() and (('--all' in sys.argv) or k not in have)]
print(json.dumps({"static": len(cnt), "translated": sum(1 for k in cnt if k in have), "templated": sum(templ.values()), "todo": len(todo)}), file=sys.stderr)
if '--list' in sys.argv:
    for c, k in todo: print(json.dumps(k, ensure_ascii=False))
