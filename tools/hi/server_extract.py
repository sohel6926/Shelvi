#!/usr/bin/env python3
"""Lists the English server messages (fail(code, te, en)) that carry values (`${x}` -> {0}, {1}…) and have no Hindi pattern yet.
Run from the project folder: python3 tools/hi/server_extract.py > tools/hi/todo-server-patterns.json"""
import re, glob, json, sys
STR = r'("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\'(?:[^\'\\]|\\.)*\')'
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
for f in sorted(glob.glob('functions/src/**/*.ts', recursive=True)):
    if '.test.' in f: continue
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'\bfail\(\s*"[a-z-]+"\s*,\s*' + STR + r'\s*,\s*' + STR + r'\s*,?\s*\)', s):
        en = m.group(2)
        if en[0] == '`' and '${' in en:
            seen.setdefault(pattern(en[1:-1]), f)
have = json.load(open('web/src/i18n/hi-patterns.json', encoding='utf-8'))
todo = [k for k in seen if k not in have]
print(len(seen), 'server patterns,', len(todo), 'without Hindi', file=sys.stderr)
print(json.dumps(todo, ensure_ascii=False, indent=0))
