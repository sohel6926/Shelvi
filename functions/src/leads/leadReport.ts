/**
 * Module 1f (18 Nov 2026) — leadReport { from, to, branchId? } (admin; a manager only for their own branch).
 * Leads created from `from` to `to` (IST days, both included, up to 366 days) → totals, by source, by person,
 * response speed (settings.leadTat.minutes is the limit). Counting is done by the pure reportRules.
 */
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections, BUSINESS_SETTINGS_DOC } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optId, reqDay } from "../shared/validate";
import { asStr, Doc } from "../shared/coerce";
import { istAt } from "../shared/istDate";
import { normalizeLeadTat } from "./tatRules";
import { buildLeadReport, ReportLead } from "./reportRules";

const DAY_MS = 24 * 60 * 60 * 1000;
const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);

export const leadReport = callable("leadReport", ADMIN_MANAGER, async (data, caller) => {
  const from = reqDay(data, "from");
  const to = reqDay(data, "to");
  const start = istAt(from, "00:00");
  const end = new Date(istAt(to, "00:00").getTime() + DAY_MS);
  if (end.getTime() <= start.getTime()) fail("invalid-argument", "మొదలు తేదీ, చివరి తేదీ కంటే ముందు ఉండాలి.", "The from date must not be after the to date.");
  if (end.getTime() - start.getTime() > 366 * DAY_MS) fail("invalid-argument", "ఒకేసారి ఒక సంవత్సరం వరకే చూడగలం.", "The period can be at most one year.");
  // Admin: the chosen branch or all branches. Manager: always their own branch.
  const branchId = caller.role === "admin" ? (optId(data, "branchId") ?? "") : caller.branchId;
  if (caller.role !== "admin" && !branchId) fail("permission-denied", "మీ account కి branch లేదు.", "Your account has no branch.");

  const db = getFirestore();
  const tat = normalizeLeadTat(((await db.collection(FirestoreCollections.SETTINGS).doc(BUSINESS_SETTINGS_DOC).get()).data() ?? {}).leadTat);
  const snap = await db.collection(FirestoreCollections.LEADS).where("createdAt", ">=", Timestamp.fromDate(start)).where("createdAt", "<", Timestamp.fromDate(end)).get();
  const rows: ReportLead[] = snap.docs
    .map((d) => d.data() as Doc)
    .filter((l) => !branchId || asStr(l.branchId) === branchId)
    .map((l) => ({
      status: asStr(l.status, "new"),
      source: asStr(l.source, "other"),
      assignedTo: asStr(l.assignedTo),
      assignedName: asStr(l.assignedName),
      createdAtMs: ms(l.createdAt),
      firstResponseAtMs: ms(l.firstResponseAt),
      imported: l.imported === true,
      cancelled: l.cancelled === true || l.archived === true,
    }));
  return { from, to, branchId, limitMinutes: tat.minutes, ...buildLeadReport(rows, tat.minutes) };
});
