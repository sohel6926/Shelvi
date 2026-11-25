/**
 * Module 4c (19 Nov 2026) — period lock for every money document. Once the owner locks a month (lockPeriod), nothing
 * dated in or before it can be added, changed or cancelled; a correction is booked in the open month instead.
 */
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { asStr, Doc } from "../shared/coerce";
import { dayOfValue } from "../shared/istDate";
import { isLockedDay } from "./ledgerRules";

export const LOCK_DOC = "periodLock";

export async function lockedThrough(): Promise<string> {
  const snap = await getFirestore().collection(FirestoreCollections.SETTINGS).doc(LOCK_DOC).get();
  return asStr((snap.data() ?? {}).lockedThrough);
}

/** Refuses when `day` ("YYYY-MM-DD") falls in a locked month. A missing day is let through (nothing to compare). */
export async function assertOpenDay(day: string | null | undefined): Promise<void> {
  if (!day) return;
  const locked = await lockedThrough();
  if (isLockedDay(day, locked)) {
    fail(
      "failed-precondition",
      `${locked} వరకు పుస్తకాలు లాక్ అయ్యాయి. ${day} తేదీ పత్రాన్ని చేర్చలేరు / మార్చలేరు. సవరణ కావాలంటే ఈ నెల తేదీతో రాయండి, లేదా యజమాని ఆ నెలను తిరిగి తెరవాలి.`,
      `The books are locked through ${locked}. A document dated ${day} can't be added or changed. Book the correction in the open month, or have the owner reopen that month.`,
    );
  }
}

/** The day a money document belongs to in the books (same choice as ledgerSources); null = not a money document. */
export function moneyDayOf(collection: string, doc: Doc): string | null {
  switch (collection) {
    case "invoices":
      return dayOfValue(doc.issueDate) ?? dayOfValue(doc.createdAt);
    case "payments":
      return asStr(doc.day) || dayOfValue(doc.date);
    case "purchases":
      return dayOfValue(doc.purchaseDate) ?? dayOfValue(doc.createdAt);
    case "expenses":
      return dayOfValue(doc.serviceDate) ?? dayOfValue(doc.createdAt);
    case "outsideOrders":
      return asStr(doc.date) || dayOfValue(doc.createdAt);
    case "staffAdvances":
      return asStr(doc.date) || dayOfValue(doc.createdAt);
    case "vendorPayments":
      return asStr(doc.date) || dayOfValue(doc.paidAt);
    case "salaryPayments":
      return asStr(doc.date) || null;
    case "packedSales":
      return asStr(doc.saleDay) || null;
    default:
      return null;
  }
}
