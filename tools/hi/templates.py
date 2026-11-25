#!/usr/bin/env python3
"""Lists English strings with values inside (L(`…${x}…`)) as patterns: ${x} becomes {0}, {1}…
Usage: python3 tools/hi/templates.py [--todo]  → one JSON string per line"""
import re, glob, json, sys
STR = r'("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)'
def pattern(en):
    out, i, n = [], 0, 0
    while i < len(en):
        if en.startswith('${', i):
            d, j = 1, i + 2
            while j < len(en) and d:
                d += en[j] == '{'; d -= en[j] == '}'; j += 1
            out.append('{%d}' % n); n += 1; i = j
        else:
            out.append(en[i]); i += 1
    return ''.join(out)
seen = {}
for f in sorted(glob.glob('web/src/**/*.ts*', recursive=True)):
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'\bL\(\s*' + STR + r'\s*,\s*' + STR + r'\s*,?\s*\)', s):
        en = m.group(2)
        if en[0] == '`' and '${' in en:
            seen.setdefault(pattern(en[1:-1]), f)
have = {}
try: have = json.load(open('web/src/i18n/hi-patterns.json', encoding='utf-8'))
except FileNotFoundError: pass
todo = [k for k in seen if not ('--todo' in sys.argv and k in have)]
print(len(seen), 'patterns,', len(todo), 'listed', file=sys.stderr)
for k in todo: print(json.dumps(k, ensure_ascii=False))
