import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { FirestoreCollections } from "./firestorePaths";
import { renderTemplate, TemplateKey, TemplateParams, templateParams } from "./templates";
import { Audience, chooseSendMode, decideOutboxStatus, normalizeIndianPhone, outboxId } from "./messagePolicy";
import { loadSettings } from "./settings";
import { toDateValue } from "./istDate";

export { decideOutboxStatus, normalizeIndianPhone, outboxId };
export type { Audience, OutboxStatus } from "./messagePolicy";

export interface EnqueueInput {
  audience: Audience;
  to: unknown;
  template: TemplateKey;
  params: TemplateParams;
  agentId: string;
  relatedType?: string;
  relatedId?: string;
  optIn?: boolean;
  moneyRelated?: boolean;
  firstContact?: boolean;
  /** Same key → the message is created at most once (agents can re-run safely). */
  dedupeKey: string;
  /** R10-8: when the person last wrote to us on WhatsApp (customers/leads `whatsappLastInboundAt`) — text allowed for 24 h */
  lastInboundAt?: unknown;
}

let templateCache: { at: number; templates: Record<string, string> } | null = null;

/** settings.whatsappTemplates, re-read at most once a minute per instance. */
export async function whatsappTemplates(): Promise<Record<string, string>> {
  if (templateCache && Date.now() - templateCache.at < 60_000) return templateCache.templates;
  const templates = (await loadSettings()).whatsappTemplates;
  templateCache = { at: Date.now(), templates };
  return templates;
}

export type EnqueueResult = "queued" | "needs-approval" | "skipped-no-optin" | "skipped-no-phone" | "duplicate";

export async function enqueueMessage(m: EnqueueInput): Promise<EnqueueResult> {
  const decided = decideOutboxStatus(m);
  if (decided === null) return "skipped-no-optin";
  const to = normalizeIndianPhone(m.to);
  if (!to) return "skipped-no-phone";
  // R10-8: template outside the 24 h window; no template → held for the owner ("template కావాలి").
  const mode = chooseSendMode({ key: m.template, templates: await whatsappTemplates(), lastInboundMs: toDateValue(m.lastInboundAt)?.getTime() ?? null, nowMs: Date.now() });
  const status = "hold" in mode ? "needs-approval" : decided;
  const sendFields =
    "hold" in mode
      ? { sendAs: "template", metaTemplate: "", metaParams: templateParams(m.template, m.params), holdReason: "template-missing", holdTe: "template కావాలి" }
      : mode.sendAs === "template"
        ? { sendAs: "template", metaTemplate: mode.metaTemplate, metaParams: templateParams(m.template, m.params), language: "te" }
        : { sendAs: "text" };
  const ref = getFirestore().collection(FirestoreCollections.MESSAGES_OUTBOX).doc(outboxId(m.dedupeKey));
  try {
    await ref.create({
      channel: "whatsapp",
      to,
      audience: m.audience,
      template: m.template,
      params: Object.fromEntries(Object.entries(m.params).map(([k, v]) => [k, v === undefined || v === null ? "" : v])),
      text: renderTemplate(m.template, m.params),
      relatedType: m.relatedType ?? "",
      relatedId: m.relatedId ?? "",
      agentId: m.agentId,
      moneyRelated: m.moneyRelated === true,
      firstContact: m.firstContact === true,
      ...sendFields,
      status,
      error: "",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return status as EnqueueResult;
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    if (code === 6 || code === "already-exists" || code === "ALREADY_EXISTS") return "duplicate";
    logger.error("enqueueMessage failed", e);
    throw e;
  }
}

/** Owner alert (WhatsApp to the owner's phone from settings), deduplicated by key. */
export async function alertOwner(ownerPhone: string, agentId: string, title: string, bodyText: string, dedupeKey: string): Promise<EnqueueResult> {
  return enqueueMessage({
    audience: "owner",
    to: ownerPhone,
    template: "owner.alert",
    params: { title, body: bodyText },
    agentId,
    dedupeKey,
  });
}
