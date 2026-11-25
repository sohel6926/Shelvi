/**
 * 20 Nov 2026 — books export (pure rules; tested in test/module6b.test.ts). One row per journal line, in date order,
 * so an accountant can bring the books into Tally / Zoho Books / Excel with that tool's own import. It is a plain
 * "accounting CSV" layout, NOT a native Tally file: nothing here has been tried inside Tally.
 */
import { JournalEntry } from "./ledgerRules";

export interface ExportRow {
  day: string;
  /** running voucher number for this export: V0001, V0002 … (one number per journal entry) */
  voucher: string;
  kind: string;
  account: string;
  accountEn: string;
  accountTe: string;
  debit: number;
  credit: number;
  narration: string;
}

export const MAX_EXPORT_ROWS = 20000;

export function exportRows(
  entries: JournalEntry[],
  names: (code: string) => { te: string; en: string },
): { rows: ExportRow[]; entryCount: number; truncated: boolean } {
  const sorted = [...entries].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const rows: ExportRow[] = [];
  let truncated = false;
  let n = 0;
  for (const e of sorted) {
    if (rows.length + e.lines.length > MAX_EXPORT_ROWS) {
      truncated = true;
      break;
    }
    n += 1;
    const voucher = `V${String(n).padStart(4, "0")}`;
    for (const l of e.lines) {
      const nm = names(l.account);
      rows.push({ day: e.day, voucher, kind: e.source.kind, account: l.account, accountEn: nm.en, accountTe: nm.te, debit: l.debit, credit: l.credit, narration: e.memo });
    }
  }
  return { rows, entryCount: n, truncated };
}
