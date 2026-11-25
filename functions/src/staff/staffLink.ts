import { REGION } from "../setup";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, DocumentSnapshot } from "firebase-admin/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asStr, Doc } from "../shared/coerce";
import { staffLinkChanges } from "./linkLogic";

export { staffLinkChanges };

/** Keeps users/{uid}.staffId = staff doc id (firestore.rules use it to let staff see their bookings). */
export const syncStaffLink = onDocumentWritten(
  { document: "staff/{staffId}", region: REGION },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>) => {
    const staffId = event.params.staffId;
    const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
    const { set, clear } = staffLinkChanges(before, after);
    const users = getFirestore().collection(FirestoreCollections.USERS);
    if (clear) {
      const u = await users.doc(clear).get();
      if (u.exists && asStr((u.data() as Doc).staffId) === staffId) await u.ref.update({ staffId: FieldValue.delete() });
    }
    if (set) {
      const u = await users.doc(set).get();
      if (u.exists && asStr((u.data() as Doc).staffId) !== staffId) await u.ref.update({ staffId });
    }
  },
);
