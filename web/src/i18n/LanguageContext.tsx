import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import hiJson from "./hi.json";
import hiPatternsJson from "./hi-patterns.json";

/**
 * X18 (18 Nov 2026): Hindi. The screens are written with `L("తెలుగు", "English")`; Hindi is looked up by the English
 * text in hi.json (tools/hi/batch*.json → tools/hi/merge.py). A string without Hindi yet shows in English, so the app
 * always works while the translation grows. `python3 tools/extract-i18n.py --list` prints what is still missing.
 */
const HI = hiJson as Record<string, string>;
/** Sentences with a value inside ("{0} guests"): English pattern → Hindi pattern (tools/hi/templates.py lists them).
 *  Longest fixed text first, so "{0} min late" wins over "{0} min". */
const HI_PATTERNS: { re: RegExp; hi: string }[] = Object.entries(hiPatternsJson as Record<string, string>)
  .sort((x, y) => y[0].replace(/\{\d\}/g, "").length - x[0].replace(/\{\d\}/g, "").length)
  .map(([en, hi]) => ({
    re: new RegExp(
      "^" +
        en
          .split(/(\{\d\})/)
          .map((part) => (/^\{\d\}$/.test(part) ? "(.*?)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
          .join("") +
        "$",
      "s",
    ),
    hi,
    order: [...en.matchAll(/\{(\d)\}/g)].map((m) => Number(m[1])),
  }))
  .map(({ re, hi, order }) => ({ re, hi: hi.replace(/\{(\d)\}/g, (_, d) => `\u0000${order.indexOf(Number(d))}\u0000`) }));
const HI_SEEN = new Map<string, string>();

export const hindi = (en: string): string => {
  const exact = HI[en];
  if (exact !== undefined) return exact;
  const seen = HI_SEEN.get(en);
  if (seen !== undefined) return seen;
  let out = en;
  for (const p of HI_PATTERNS) {
    const m = p.re.exec(en);
    if (m) {
      out = p.hi.replace(/\u0000(\d+)\u0000/g, (_, i) => m[Number(i) + 1] ?? "");
      break;
    }
  }
  if (HI_SEEN.size > 5000) HI_SEEN.clear();
  HI_SEEN.set(en, out);
  return out;
};

/**
 * App-wide language. Telugu is the default — the owner reads only Telugu. The choice is kept in
 * localStorage so it survives reloads. Use `L("తెలుగు", "English")` for every visible string.
 */
/** The two languages every text is written in. Code that picks text itself (`lang === "te" ? … : …`) sees "en" while Hindi is on. */
export type Lang = "te" | "en";
/** The language the person chose. */
export type UiLang = "te" | "en" | "hi";
const NEXT: Record<UiLang, UiLang> = { te: "en", en: "hi", hi: "te" };
/** Name of each language in its own script (for the switch button). */
let CURRENT: UiLang = "te";
/** For helpers outside React that build an English word themselves (status names, sections): Hindi when Hindi is on. */
export const hiIfOn = (en: string): string => (CURRENT === "hi" ? hindi(en) : en);
/** Locale for dates and times in the chosen language. */
export const dateLocale = (lang: Lang): string => (lang === "te" ? "te-IN" : CURRENT === "hi" ? "hi-IN" : "en-IN");
export const LANG_NAME: Record<UiLang, string> = { te: "తెలుగు", en: "English", hi: "हिंदी" };
export const nextLang = (l: UiLang): UiLang => NEXT[l];

const STORAGE_KEY = "ui_lang";

export interface Bilingual {
  te: string;
  en: string;
}

interface LanguageValue {
  /** "te" or "en" — "en" while Hindi is on (see Lang). */
  lang: Lang;
  /** The chosen language, Hindi included. */
  uiLang: UiLang;
  setLang: (lang: UiLang) => void;
  toggle: () => void;
  /** Pick the string for the current language. */
  L: (te: string, en: string) => string;
  /** Pick from a {te, en} object (falls back to the other language when one side is empty). */
  T: (text: Partial<Bilingual> | null | undefined) => string;
}

function readStored(): UiLang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "en" || v === "hi" ? v : "te";
  } catch {
    return "te";
  }
}

function pickText(text: Partial<Bilingual> | null | undefined, lang: UiLang): string {
  if (!text) return "";
  if (lang === "te") return text.te || text.en || "";
  if (lang === "hi") return text.en ? hindi(text.en) : text.te || "";
  return text.en || text.te || "";
}

const LanguageContext = createContext<LanguageValue>({
  lang: "te",
  uiLang: "te",
  setLang: () => {},
  toggle: () => {},
  L: (te) => te,
  T: (t) => pickText(t, "te"),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [uiLang, setLangState] = useState<UiLang>(readStored);
  const lang: Lang = uiLang === "te" ? "te" : "en";
  CURRENT = uiLang;

  useEffect(() => {
    document.documentElement.lang = uiLang;
  }, [uiLang]);

  const setLang = useCallback((next: UiLang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode: keep it for this visit only
    }
  }, []);

  const value = useMemo<LanguageValue>(
    () => ({
      lang,
      uiLang,
      setLang,
      toggle: () => setLang(NEXT[uiLang]),
      L: (te, en) => (uiLang === "te" ? te : uiLang === "hi" ? hindi(en) : en),
      T: (t) => pickText(t, uiLang),
    }),
    [lang, uiLang, setLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageValue {
  return useContext(LanguageContext);
}

export const MONTHS_TE = [
  "జనవరి",
  "ఫిబ్రవరి",
  "మార్చి",
  "ఏప్రిల్",
  "మే",
  "జూన్",
  "జూలై",
  "ఆగస్టు",
  "సెప్టెంబర్",
  "అక్టోబర్",
  "నవంబర్",
  "డిసెంబర్",
];
const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthName(index: number, lang: Lang): string {
  return (lang === "te" ? MONTHS_TE : CURRENT === "hi" ? MONTHS_HI : MONTHS_EN)[index] ?? String(index + 1);
}
