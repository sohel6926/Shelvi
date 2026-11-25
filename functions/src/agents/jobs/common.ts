import { getFirestore, Timestamp, Query } from "firebase-admin/firestore";
import { FirestoreCollections } from "../../shared/firestorePaths";
import { Doc } from "../../shared/coerce";
import { dayRange } from "../../shared/istDate";

export async function docsOf(q: Query): Promise<{ id: string; data: Doc }[]> {
  const s = await q.get();
  return s.docs.map((d) => ({ id: d.id, data: d.data() as Doc }));
}

/** Bookings whose event is on the IST day (cancelled excluded). */
export async function bookingsOnDay(day: string): Promise<{ id: string; data: Doc }[]> {
  const { start, end } = dayRange(day);
  const q = getFirestore()
    .collection(FirestoreCollections.BOOKINGS)
    .where("eventDate", ">=", Timestamp.fromDate(start))
    .where("eventDate", "<", Timestamp.fromDate(end));
  return (await docsOf(q)).filter((b) => b.data.status !== "Cancelled");
}

export async function getDoc(collection: string, id: string): Promise<Doc | undefined> {
  if (!id) return undefined;
  const s = await getFirestore().collection(collection).doc(id).get();
  return s.exists ? (s.data() as Doc) : undefined;
}

/** Unpaid invoices (balanceDue > 0, not cancelled). */
export async function openInvoices(): Promise<{ id: string; data: Doc }[]> {
  const q = getFirestore().collection(FirestoreCollections.INVOICES).where("balanceDue", ">", 0);
  return (await docsOf(q)).filter((i) => !["Cancelled", "Void"].includes(String(i.data.status)));
}
