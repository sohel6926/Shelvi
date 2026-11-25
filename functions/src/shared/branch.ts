/** Pure: which branchId a new document gets (contract audit fix 9). */

/** The client's selected branch, else the caller's own branch; null when both are empty (caller must reject). */
export function resolveBranchId(requested: string | undefined | null, callerBranchId: string): string | null {
  const r = (requested ?? "").trim();
  if (r) return r;
  const own = callerBranchId.trim();
  return own || null;
}

export const NO_BRANCH_ERROR = {
  te: "Branch ఎంచుకోలేదు — పైన branch ఎంచుకుని మళ్ళీ ప్రయత్నించండి.",
  en: "No branch selected: choose a branch and try again.",
};

/** Only staff belong to a branch; customers / vendors (no branch scope in firestore.rules) may have "" and menu items none. */
export function importNeedsBranch(kind: string): boolean {
  // Leads are listed per branch (Module 1c), so an imported lead must land in one.
  return kind === "staff" || kind === "leads";
}
