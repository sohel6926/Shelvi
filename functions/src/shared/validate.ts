/** Request validation for callables. Every failure is invalid-argument with Telugu + English text. */
import { fail } from "./errors";
import { asObj, Doc } from "./coerce";
import { isValidDay, isValidMonth } from "./istDate";

export function body(data: unknown): Doc {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    fail("invalid-argument", "Request వివరాలు లేవు.", "Request body must be an object.");
  }
  return asObj(data);
}

function bad(field: string, te: string, en: string): never {
  return fail("invalid-argument", `"${field}": ${te}`, `${field}: ${en}`);
}

export function reqString(d: Doc, field: string, max = 500): string {
  const v = d[field];
  if (typeof v !== "string" || v.trim() === "") bad(field, "తప్పనిసరిగా ఇవ్వాలి.", "is required.");
  if (v.length > max) bad(field, `${max} అక్షరాల కంటే ఎక్కువ ఉండకూడదు.`, `must be at most ${max} characters.`);
  return v.trim();
}

export function optString(d: Doc, field: string, max = 2000): string | undefined {
  const v = d[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") bad(field, "అక్షరాలు (text) గా ఉండాలి.", "must be text.");
  if (v.length > max) bad(field, `${max} అక్షరాల కంటే ఎక్కువ ఉండకూడదు.`, `must be at most ${max} characters.`);
  return v.trim();
}

export interface NumOpts {
  min?: number;
  max?: number;
  int?: boolean;
  /** min is exclusive (value must be greater than min) */
  gt?: boolean;
}

export function checkNum(field: string, v: unknown, o: NumOpts = {}): number {
  if (typeof v !== "number" || !Number.isFinite(v)) bad(field, "సరైన అంకె ఇవ్వాలి.", "must be a number.");
  if (o.int && !Number.isInteger(v)) bad(field, "పూర్ణ సంఖ్య (whole number) గా ఉండాలి.", "must be a whole number.");
  if (o.min !== undefined) {
    if (o.gt ? v <= o.min : v < o.min) bad(field, `${o.min} ${o.gt ? "కంటే ఎక్కువ" : "లేదా అంతకంటే ఎక్కువ"} ఉండాలి.`, `must be ${o.gt ? ">" : "≥"} ${o.min}.`);
  }
  if (o.max !== undefined && v > o.max) bad(field, `${o.max} కంటే ఎక్కువ ఉండకూడదు.`, `must be ≤ ${o.max}.`);
  return v;
}

export function reqNum(d: Doc, field: string, o: NumOpts = {}): number {
  return checkNum(field, d[field], o);
}

export function optNum(d: Doc, field: string, o: NumOpts = {}): number | undefined {
  const v = d[field];
  if (v === undefined || v === null) return undefined;
  return checkNum(field, v, o);
}

export function reqBool(d: Doc, field: string): boolean {
  const v = d[field];
  if (typeof v !== "boolean") bad(field, "true లేదా false గా ఉండాలి.", "must be true or false.");
  return v;
}

export function reqOneOf<T extends string>(d: Doc, field: string, values: readonly T[]): T {
  const v = d[field];
  if (typeof v !== "string" || !(values as readonly string[]).includes(v)) {
    bad(field, `ఇవి మాత్రమే: ${values.join(", ")}.`, `must be one of ${values.join(", ")}.`);
  }
  return v as T;
}

export function reqDay(d: Doc, field: string): string {
  const v = d[field];
  if (typeof v !== "string" || !isValidDay(v)) bad(field, "తేదీ YYYY-MM-DD రూపంలో, నిజమైన తేదీ అయి ఉండాలి.", "must be a real date YYYY-MM-DD.");
  return v;
}

export function reqMonth(d: Doc, field: string): string {
  const v = d[field];
  if (typeof v !== "string" || !isValidMonth(v)) bad(field, "నెల YYYY-MM రూపంలో ఉండాలి.", "must be a month YYYY-MM.");
  return v;
}

export function reqArray(d: Doc, field: string, maxLen = 500): unknown[] {
  const v = d[field];
  if (!Array.isArray(v)) bad(field, "list గా ఉండాలి.", "must be a list.");
  if (v.length > maxLen) bad(field, `${maxLen} కంటే ఎక్కువ ఉండకూడదు.`, `must have at most ${maxLen} entries.`);
  return v;
}

export function optArray(d: Doc, field: string, maxLen = 500): unknown[] | undefined {
  if (d[field] === undefined || d[field] === null) return undefined;
  return reqArray(d, field, maxLen);
}

/** Firestore document ids: non-empty, no slashes. */
export function reqId(d: Doc, field: string): string {
  const v = reqString(d, field, 200);
  if (v.includes("/") || v === "." || v === "..") bad(field, "సరైన id కాదు.", "is not a valid id.");
  return v;
}

export function optId(d: Doc, field: string): string | undefined {
  if (d[field] === undefined || d[field] === null || d[field] === "") return undefined;
  return reqId(d, field);
}
