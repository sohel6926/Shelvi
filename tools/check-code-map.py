#!/usr/bin/env python3
"""Checks docs/CODE-MAP.md against the code. Run from the project folder:  python3 tools/check-code-map.py
CODE-MAP.md లో ఉన్న ప్రతి file, route, callable, collection, rules section నిజంగా ఉందో లేదో చూస్తుంది.

Rules (inside `backticks` in CODE-MAP.md):
  fn:x  -> functions/src/x        web:x -> web/src/x        app:x -> app/src/main/java/com/example/suseelacateringcrm/x
  a/b.c or folder/  (has a "/" or a file extension) -> must exist from the project folder
  name()            -> must be exported from functions/src/index.ts
  /route            -> must be a path: "..." in web/src/routes/AppRouter.tsx
  plainName         -> must be a Firestore collection (functions/src/shared/firestorePaths.ts or a match in firestore.rules)
  «Section»         (no backticks) -> must be a section heading in firestore.rules
Exit code 1 if anything is missing.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREFIX = {"fn:": "functions/src/", "web:": "web/src/", "app:": "app/src/main/java/com/example/suseelacateringcrm/"}
SKIP = {"npm test", "npm run build", "npm run lint"}  # command snippets are skipped automatically (they contain spaces)
OPTIONAL_LOCAL = {
    "Catering-CRM-Complete-v15/",
    "_backup_2026-11-05/",
    "_snap/",
    "_snap/2026-11-18_module1a",
    "_snap/2026-11-18_module2a",
    "_snap/2026-11-18_module2b",
    "_to_delete/",
    "_xfer/",
    "app/build/outputs/apk/debug/",
    "keystore/",
    "local.properties",
    "web/.env.emulator",
}


def read(rel):
    return open(os.path.join(ROOT, rel), encoding="utf-8").read()


def main():
    doc = read("docs/CODE-MAP.md")
    index = read("functions/src/index.ts")
    exported = set(re.findall(r"\b([A-Za-z_]\w*)\b", " ".join(re.findall(r"export\s*\{([^}]*)\}", index)))) | set(
        re.findall(r"export const (\w+)", index))
    routes = set(re.findall(r'path:\s*"([^"]+)"', read("web/src/routes/AppRouter.tsx")))
    rules = read("firestore.rules")
    collections = set(re.findall(r':\s*"(\w+)"', read("functions/src/shared/firestorePaths.ts"))) | set(
        re.findall(r"match /(\w+)/", rules))
    rule_sections = set(s.strip() for s in re.findall(r"// =+ (.+)", rules))

    missing, checked = [], 0
    for tok in re.findall(r"`([^`\n]+)`", doc):
        if " " in tok and not tok.endswith(".command"):
            continue  # a command or phrase, not a path
        if tok in OPTIONAL_LOCAL:
            continue
        checked += 1
        t = tok
        for p, full in PREFIX.items():
            if t.startswith(p):
                t = full + t[len(p):]
                break
        if os.path.exists(os.path.join(ROOT, t)):
            ok = True
        elif t.endswith("()"):
            ok = t[:-2] in exported
        elif t.startswith("/"):
            ok = t in routes
        elif "/" in t or re.search(r"\.\w+$", t):
            ok = os.path.exists(os.path.join(ROOT, t))
        elif re.fullmatch(r"[A-Za-z]\w*", t):
            ok = t in collections
        else:
            ok = True
        if not ok:
            missing.append(tok)
    for sec in re.findall(r"«([^»]+)»", doc):
        if sec.strip() in ("", "…"):
            continue  # the legend
        checked += 1
        if sec not in rule_sections:
            missing.append("«" + sec + "»")
    for m in sorted(set(missing)):
        print("MISSING:", m)
    print(f"checked {checked} references, missing {len(set(missing))}")
    sys.exit(1 if missing else 0)


main()
