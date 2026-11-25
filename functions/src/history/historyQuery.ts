/** Pure parts of getHistory: filters on entries already read, cursor paging. */
import { Doc } from "../shared/coerce";

export interface HistoryFilter {
  collection?: string;
  docId?: string;
  by?: string;
  /** inclusive IST day bounds as instants: entry.atMs ≥ fromMs and < toMsExcl */
  fromMs?: number;
  toMsExcl?: number;
}

export interface RawEntry {
  id: string;
  atMs: number;
  data: Doc;
}

/** Who did it: change entries have `by`, older function entries `uid`. */
export function entryBy(d: Doc): string {
  return typeof d.by === "string" && d.by ? d.by : typeof d.uid === "string" && d.uid ? d.uid : "system";
}

export function matchesHistory(e: RawEntry, f: HistoryFilter): boolean {
  if (f.collection && e.data.collection !== f.collection) return false;
  if (f.docId && e.data.docId !== f.docId) return false;
  if (f.by && entryBy(e.data) !== f.by) return false;
  if (f.fromMs !== undefined && e.atMs < f.fromMs) return false;
  if (f.toMsExcl !== undefined && e.atMs >= f.toMsExcl) return false;
  return true;
}

/** Newest first; ties by id so paging is stable. */
export function sortHistory(entries: RawEntry[]): RawEntry[] {
  return [...entries].sort((a, b) => b.atMs - a.atMs || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** One page after `startAfter` (an entry id); nextCursor = last id when more remain. */
export function pageHistory(sorted: RawEntry[], limit: number, startAfter?: string): { page: RawEntry[]; nextCursor: string | null } {
  let start = 0;
  if (startAfter) {
    const i = sorted.findIndex((e) => e.id === startAfter);
    start = i >= 0 ? i + 1 : sorted.length;
  }
  const page = sorted.slice(start, start + limit);
  return { page, nextCursor: start + limit < sorted.length && page.length ? page[page.length - 1].id : null };
}
