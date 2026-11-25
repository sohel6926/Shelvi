import type { DocumentData } from "firebase/firestore";

/**
 * R7-3: nothing is hard-deleted. Transactions get `status: "Cancelled"` (+ cancelReason / cancelledBy /
 * cancelledAt) and master data gets `archived: true`, both only through the cancelRecord callable.
 * Old Android soft-deletes (`isDeleted: true`) count as cancelled too.
 */
export interface CancelInfo {
  cancelled: boolean;
  cancelReason: string;
}

export function cancelInfo(d: DocumentData | undefined): CancelInfo {
  const status = typeof d?.status === "string" ? d.status : "";
  return {
    cancelled: status === "Cancelled" || status === "cancelled" || d?.archived === true || d?.isDeleted === true,
    cancelReason: typeof d?.cancelReason === "string" ? d.cancelReason : "",
  };
}

/** Rows to show: cancelled ones only when the "show cancelled" switch is on. */
export function visibleRows<T extends { cancelled: boolean }>(rows: T[], showCancelled: boolean): T[] {
  return showCancelled ? rows : rows.filter((r) => !r.cancelled);
}

/** Rows that count in totals / stats (never the cancelled ones). */
export function liveRows<T extends { cancelled: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => !r.cancelled);
}
