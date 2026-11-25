import { REGION } from "../setup";
import { DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { Doc } from "../shared/coerce";
import { acceptedVersionUpdate } from "./quotationVersions";

/** R7-10: when a quotation's status becomes Accepted, remember which version the customer accepted. */
export const quotationAcceptedVersion = onDocumentWritten(
  { document: "quotations/{quotationId}", region: REGION },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
    const v = acceptedVersionUpdate(before, after.data() as Doc);
    if (v !== null) await after.ref.update({ acceptedVersion: v, acceptedAt: new Date() });
  },
);
