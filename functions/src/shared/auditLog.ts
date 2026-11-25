import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { FirestoreCollections } from "./firestorePaths";

export interface AuditEntryInput {
  uid: string;
  role: string;
  action: string;
  collection: string;
  docId: string;
  before?: unknown;
  after?: unknown;
  /** "override" for manual values, "action" (default) for other function calls; change entries come from history triggers */
  kind?: "override" | "action";
  /** owner-readable sentence for the history screen (shown instead of a generic "… మార్చారు") */
  summary?: { te: string; en: string };
}

/** Append-only — client writes are blocked in firestore.rules, so this is the only way entries get created. */
export async function writeAuditEntry(entry: AuditEntryInput): Promise<void> {
  const { kind, ...rest } = entry;
  await getFirestore()
    .collection(FirestoreCollections.AUDIT_LOG)
    .add({ ...rest, kind: kind ?? "action", by: entry.uid, at: FieldValue.serverTimestamp(), timestamp: FieldValue.serverTimestamp() });
}
