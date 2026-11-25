import { dateLocale, MONTHS_TE } from "../i18n/LanguageContext";

/**
 * Indian-rupee formatting (₹1,23,456). Round 9: 2 decimals only when there are paise (₹2,499.50, never ₹2,499.5).
 */
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});
const inrPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function formatINR(value: number | null | undefined): string {
  const v = Number.isFinite(value) ? (value as number) : 0;
  return (Math.round(Math.abs(v) * 100) % 100 !== 0 ? inrPaise : inr).format(v);
}

/**
 * Round 9 money display: "₹1,23,456" — Indian grouping, 2 decimals only when there are paise ("₹1,234.50").
 * Negative values get a real minus sign.
 */
export function formatMoney(value: number | null | undefined): string {
  const v = Number.isFinite(value) ? (value as number) : 0;
  const paise = Math.round(Math.abs(v) * 100);
  const hasPaise = paise % 100 !== 0;
  const text = (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  });
  return `${v < 0 && paise > 0 ? "−" : ""}₹${text}`;
}

export function formatDate(date: Date | null | undefined, lang: "te" | "en" = "en"): string {
  if (!date) return "—";
  return date.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric" });
}

/** "2026-11" style key used to group records by month. */
export function monthKey(date: Date | null | undefined): string {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string, lang: "te" | "en" = "en"): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  if (lang === "te") return `${MONTHS_TE[m - 1]} ${y}`;
  return new Date(y, m - 1, 1).toLocaleDateString(dateLocale("en"), { month: "long", year: "numeric" });
}

export function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + (pick(row) || 0), 0);
}
