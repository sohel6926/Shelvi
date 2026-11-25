import { getFirestore, FieldValue, Transaction } from "firebase-admin/firestore";
import { FirestoreCollections } from "./firestorePaths";
import { asNum } from "./coerce";

import { CounterKind, formatDocNumber } from "./docNumber";

export { formatDocNumber };
export type { CounterKind };

/**
 * Reserves the next number for kind/year inside a transaction (counter doc counters/{kind}-{year}).
 * Firestore transactions need all reads before writes: call this after the caller's other reads and
 * before its writes. It performs one read and one write.
 */
export async function reserveNumber(tx: Transaction, kind: CounterKind, year: number): Promise<string> {
  const ref = getFirestore().collection(FirestoreCollections.COUNTERS).doc(`${kind}-${year}`);
  const snap = await tx.get(ref);
  const next = Math.floor(asNum(snap.data()?.last)) + 1;
  tx.set(ref, { kind, year, last: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return formatDocNumber(kind, year, next);
}
