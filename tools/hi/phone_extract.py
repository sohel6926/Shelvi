#!/usr/bin/env python3
"""Phone Hindi: lists the English texts in L("తెలుగు", "English") calls of the Android app (and the tr() value map)
that have no Hindi yet. Kotlin ${x} / $x become {0}, {1}…  Usage: python3 tools/hi/phone_extract.py [--all]
Writes tools/hi/phone/todo-static.json and todo-patterns.json (lists of English strings)."""
import re, glob, json, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STR = r'"((?:[^"\\]|\\.)*)"'
def unescape(s):
    s = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), s)
    return s.replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t').replace('\\\\', '\\').replace('\\$', '\x01')
def to_pattern(en):
    out, i, n = [], 0, 0
    while i < len(en):
        if en.startswith('${', i):
            d, j = 1, i + 2
            while j < len(en) and d:
                d += en[j] == '{'; d -= en[j] == '}'; j += 1
            out.append('{%d}' % n); n += 1; i = j
        elif en[i] == '$' and i + 1 < len(en) and (en[i+1].isalpha() or en[i+1] == '_'):
            j = i + 1
            while j < len(en) and (en[j].isalnum() or en[j] == '_'): j += 1
            out.append('{%d}' % n); n += 1; i = j
        else:
            out.append(en[i]); i += 1
    return ''.join(out)
def collect():
    stat, pats = {}, {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'app/src/main/java/**/*.kt'), recursive=True)):
        src = open(f, encoding='utf-8').read()
        for m in re.finditer(r'\bL\(\s*' + STR + r'\s*,\s*' + STR + r'\s*,?\s*\)', src):
            en = unescape(m.group(2))
            if '$' in en:
                pats.setdefault(to_pattern(en).replace('\x01', '$'), f)
            else:
                stat.setdefault(en.replace('\x01', '$'), f)
    # Field / option tables written as f("key", "te", "en"), o("code", "te", "en"), MField("key", "te", "en", …) (MasterForms.kt)
    for f in sorted(glob.glob(os.path.join(ROOT, 'app/src/main/java/**/*.kt'), recursive=True)):
        src = open(f, encoding='utf-8').read()
        for m in re.finditer(r'\b(?:f|o|MField|MOpt)\(\s*' + STR + r'\s*,\s*' + STR + r'\s*,\s*' + STR, src):
            stat.setdefault(unescape(m.group(3)).replace('\x01', '$'), f)
    # Server messages (functions/src fail(code, te, en)) reach the phone through CallableError.text -> L(te, en), so the phone
    # needs their Hindi too: plain texts and the `${x}` templates (-> {0}, {1}…).
    TS = r'("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\'(?:[^\'\\]|\\.)*\')'
    for f in sorted(glob.glob(os.path.join(ROOT, 'functions/src/**/*.ts'), recursive=True)):
        if '.test.' in f: continue
        src = open(f, encoding='utf-8').read()
        for m in re.finditer(r'\bfail\(\s*"[a-z-]+"\s*,\s*' + TS + r'\s*,\s*' + TS + r'\s*,?\s*\)', src):
            en = m.group(2)
            body = en[1:-1]
            if en[0] == '`' and '${' in body:
                pt = to_pattern(body)
                if re.sub(r'\{\d\}|[\s:,./-]', '', pt):  # skip pass-through templates like "{0}: {1}"
                    pats.setdefault(pt, f)
            elif '${' not in body:
                stat.setdefault(body.replace('\\"', '"').replace("\\'", "'"), f)
    # tr(): the values of the Telugu map (statuses, units …) need Hindi too
    lang = open(os.path.join(ROOT, 'app/src/main/java/com/example/suseelacateringcrm/util/Lang.kt'), encoding='utf-8').read()
    for m in re.finditer(STR + r'\s+to\s+' + STR, lang):
        stat.setdefault(unescape(m.group(1)), 'Lang.kt')
    return stat, pats
def have_static():
    h = {}
    for p in [os.path.join(ROOT, 'web/src/i18n/hi.json')] + glob.glob(os.path.join(ROOT, 'tools/hi/phone/batch*.json')):
        if os.path.exists(p): h.update(json.load(open(p, encoding='utf-8')))
    return h
def have_patterns():
    h = {}
    p = os.path.join(ROOT, 'web/src/i18n/hi-patterns.json')
    if os.path.exists(p): h.update(json.load(open(p, encoding='utf-8')))
    for p in glob.glob(os.path.join(ROOT, 'tools/hi/phone/pbatch*.json')): h.update(json.load(open(p, encoding='utf-8')))
    return h
if __name__ == '__main__':
    stat, pats = collect()
    hs, hp = have_static(), have_patterns()
    ts = [k for k in stat if k not in hs]; tp = [k for k in pats if k not in hp]
    json.dump(ts, open(os.path.join(ROOT, 'tools/hi/phone/todo-static.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    json.dump(tp, open(os.path.join(ROOT, 'tools/hi/phone/todo-patterns.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(json.dumps({"static": len(stat), "static_todo": len(ts), "patterns": len(pats), "patterns_todo": len(tp)}))
