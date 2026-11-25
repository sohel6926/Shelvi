import { REGION } from "../setup";
import { DocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { Doc } from "../shared/coerce";
import { sessionSyncUpdate } from "./sessions";

/** R7-5: keep guestCount / eventDate / guestCountActual of a booking with sessions in sync (idempotent). */
export const syncBookingSessions = onDocumentWritten(
  { document: "bookings/{bookingId}", region: REGION },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const u = sessionSyncUpdate(after.data() as Doc);
    if (!u) return;
    if (u.eventDate instanceof Date) u.eventDate = Timestamp.fromDate(u.eventDate);
    await after.ref.update({ ...u, updatedBy: "system" });
  },
);
