/**
 * Security review R7: equipmentMoves carry the booking's assignedStaffIds (server-maintained) so a rule can let
 * assigned staff read them without get(). Kept in sync when a move is written and when the booking's staff change.
 */
import { REGION } from "../setup";
import { getFirestore, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asArr, asStr, Doc } from "../shared/coerce";
import { sameValue } from "../shared/historyDiff";

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

export const syncMoveStaff = onDocumentWritten({ document: "equipmentMoves/{moveId}", region: REGION }, async (event: WriteEvent) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const move = after.data() as Doc;
  const bookingId = asStr(move.bookingId);
  if (!bookingId) return;
  const b = await getFirestore().collection(FirestoreCollections.BOOKINGS).doc(bookingId).get();
  const staff = b.exists ? asArr((b.data() as Doc).assignedStaffIds).map(String) : [];
  if (!sameValue(asArr(move.assignedStaffIds).map(String), staff)) await after.ref.update({ assignedStaffIds: staff });
});

export const syncBookingStaffToMoves = onDocumentWritten({ document: "bookings/{bookingId}", region: REGION }, async (event: WriteEvent) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
  const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
  if (!after) return;
  const staff = asArr(after.assignedStaffIds).map(String);
  if (before && sameValue(asArr(before.assignedStaffIds).map(String), staff)) return;
  const db = getFirestore();
  const moves = await db.collection(FirestoreCollections.EQUIPMENT_MOVES).where("bookingId", "==", event.params.bookingId).get();
  const batch = db.batch();
  let n = 0;
  for (const m of moves.docs) {
    if (!sameValue(asArr((m.data() as Doc).assignedStaffIds).map(String), staff)) {
      batch.update(m.ref, { assignedStaffIds: staff });
      n++;
    }
  }
  if (n) await batch.commit();
});
