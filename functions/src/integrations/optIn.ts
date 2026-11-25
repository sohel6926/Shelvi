/** R10-8: WhatsApp consent tick on customers / leads gets a server date + who (whatsappOptInAt / whatsappOptInBy). */
import { REGION } from "../setup";
import { DocumentSnapshot, FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { Doc } from "../shared/coerce";
import { optInStamp } from "./optInRules";

export { optInStamp };

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

function stampTrigger(document: string) {
  return onDocumentWritten({ document, region: REGION }, async (event: WriteEvent) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
    const s = optInStamp(before, after);
    if (!s || !event.data?.after) return;
    const at = after?.whatsappOptIn === true ? { whatsappOptInAt: FieldValue.serverTimestamp() } : { whatsappOptOutAt: FieldValue.serverTimestamp() };
    await event.data.after.ref.update({ ...s, ...at, updatedBy: "system" });
  });
}

export const optInOnCustomer = stampTrigger("customers/{id}");
export const optInOnLead = stampTrigger("leads/{id}");
