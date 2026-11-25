/**
 * WhatsApp Cloud API adapter (graph.facebook.com).
 * Until the secrets WHATSAPP_TOKEN and WHATSAPP_PHONE_ID hold real values, nothing is sent:
 * messages stay `queued` and this logs once per instance. (When deploying before the new SIM is
 * ready, enter `none` for both secrets.)
 */
import { REGION } from "../setup";
import { defineSecret } from "firebase-functions/params";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, DocumentSnapshot, DocumentReference } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asStr, Doc } from "../shared/coerce";
import { resolveAtSend } from "../shared/messagePolicy";
import { whatsappTemplates } from "../shared/outbox";
import { TIME_ZONE } from "../setup";
import { buildTemplateMessageBody, buildTextMessageBody, isConfigured, metaTemplateName } from "./whatsappMessages";

export { buildTemplateMessageBody, buildTextMessageBody, isConfigured, metaTemplateName };

export const WHATSAPP_TOKEN = defineSecret("WHATSAPP_TOKEN");
export const WHATSAPP_PHONE_ID = defineSecret("WHATSAPP_PHONE_ID");
export const GRAPH_API_VERSION = "v21.0";

let loggedNotConfigured = false;

function secretValue(s: { value(): string }): string {
  try {
    return s.value();
  } catch {
    return "";
  }
}

export type SendResult = { status: "sent"; providerId: string } | { status: "queued" } | { status: "failed"; error: string };

export async function sendWhatsApp(msg: Doc): Promise<SendResult> {
  const token = secretValue(WHATSAPP_TOKEN);
  const phoneId = secretValue(WHATSAPP_PHONE_ID);
  if (!isConfigured(token, phoneId)) {
    if (!loggedNotConfigured) {
      logger.info("WhatsApp not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID) — messages stay queued.");
      loggedNotConfigured = true;
    }
    return { status: "queued" };
  }
  const to = asStr(msg.to);
  const mode = asStr(msg.sendAs, "text");
  const payload =
    mode === "template"
      ? buildTemplateMessageBody(to, asStr(msg.metaTemplate) || metaTemplateName(asStr(msg.template)), asStr(msg.language, "te"), Array.isArray(msg.metaParams) ? (msg.metaParams as unknown[]).map(String) : [])
      : buildTextMessageBody(to, asStr(msg.text));
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
    if (!res.ok) return { status: "failed", error: json.error?.message ?? `HTTP ${res.status}` };
    return { status: "sent", providerId: json.messages?.[0]?.id ?? "" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Claims a queued message (queued → sending) so the trigger and the hourly flush never double-send. */
async function claimAndSend(ref: DocumentReference): Promise<void> {
  const token = secretValue(WHATSAPP_TOKEN);
  const phoneId = secretValue(WHATSAPP_PHONE_ID);
  if (!isConfigured(token, phoneId)) {
    await sendWhatsApp({}); // logs once, leaves it queued
    return;
  }
  const db = getFirestore();
  const msg = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() as Doc | undefined;
    if (!d || d.status !== "queued") return null;
    tx.update(ref, { status: "sending", claimedAt: FieldValue.serverTimestamp() });
    return d;
  });
  if (!msg) return;
  // R10-8: a held "template కావాలి" message approved by the owner uses the template if it has been set since.
  const mode = resolveAtSend(msg, await whatsappTemplates());
  const r = await sendWhatsApp({ ...msg, ...mode });
  if (r.status === "sent") {
    await ref.update({ status: "sent", providerId: r.providerId, sentAt: FieldValue.serverTimestamp(), error: "", updatedAt: FieldValue.serverTimestamp() });
  } else if (r.status === "failed") {
    await ref.update({ status: "failed", error: r.error, updatedAt: FieldValue.serverTimestamp() });
  } else {
    await ref.update({ status: "queued", updatedAt: FieldValue.serverTimestamp() });
  }
}

/** Sender: fires when an outbox message becomes `queued` (new, or approved by the owner). */
export const sendQueuedMessage = onDocumentWritten(
  { document: "messagesOutbox/{messageId}", region: REGION, secrets: [WHATSAPP_TOKEN, WHATSAPP_PHONE_ID] },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const status = asStr((after.data() as Doc).status);
    const beforeStatus = event.data?.before?.exists ? asStr((event.data.before.data() as Doc).status) : "";
    if (status !== "queued" || beforeStatus === "queued") return;
    await claimAndSend(after.ref);
  },
);

/** Hourly 08:00–21:00 IST: sends messages still queued (e.g. queued before the secrets were set). */
export const flushOutbox = onSchedule(
  { schedule: "5 8-21 * * *", timeZone: TIME_ZONE, region: REGION, secrets: [WHATSAPP_TOKEN, WHATSAPP_PHONE_ID] },
  async () => {
    if (!isConfigured(secretValue(WHATSAPP_TOKEN), secretValue(WHATSAPP_PHONE_ID))) return;
    const snap = await getFirestore().collection(FirestoreCollections.MESSAGES_OUTBOX).where("status", "==", "queued").limit(50).get();
    for (const d of snap.docs) await claimAndSend(d.ref);
  },
);
