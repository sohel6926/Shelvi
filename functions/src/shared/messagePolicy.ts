/** Pure message rules (who may be messaged, phone format, ids). */
export type Audience = "owner" | "customer" | "staff";
export type OutboxStatus = "queued" | "needs-approval" | "sending" | "sent" | "failed" | "cancelled";

/** WhatsApp lets a business send free text only inside 24 h after the person last wrote to us. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** settings.whatsappTemplates lookup: full key ("customer.duesReminder") or its last part ("duesReminder"). */
export function templateNameFor(templates: Record<string, string>, key: string): string | null {
  const short = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
  return templates[key] || templates[short] || null;
}

export type SendMode = { sendAs: "text" } | { sendAs: "template"; metaTemplate: string } | { hold: "template-missing" };

/**
 * R10-8: plain text only when the person wrote to us in the last 24 h; otherwise the Meta-approved template set in
 * settings.whatsappTemplates[type]; no template → the message is held for the owner ("template కావాలి").
 */
export function chooseSendMode(p: { key: string; templates: Record<string, string>; lastInboundMs: number | null; nowMs: number }): SendMode {
  if (p.lastInboundMs !== null && p.nowMs - p.lastInboundMs >= 0 && p.nowMs - p.lastInboundMs < SERVICE_WINDOW_MS) return { sendAs: "text" };
  const name = templateNameFor(p.templates, p.key);
  return name ? { sendAs: "template", metaTemplate: name } : { hold: "template-missing" };
}

/**
 * At send time (e.g. after the owner approved a held message): a template set since then is used; otherwise the
 * owner's approval sends it as plain text (Meta delivers it only inside the 24 h window).
 */
export function resolveAtSend(msg: { sendAs?: unknown; metaTemplate?: unknown; holdReason?: unknown; template?: unknown }, templates: Record<string, string>): { sendAs: "text" } | { sendAs: "template"; metaTemplate: string } {
  if (msg.sendAs === "template" && typeof msg.metaTemplate === "string" && msg.metaTemplate) return { sendAs: "template", metaTemplate: msg.metaTemplate };
  if (msg.holdReason === "template-missing") {
    const name = templateNameFor(templates, String(msg.template ?? ""));
    return name ? { sendAs: "template", metaTemplate: name } : { sendAs: "text" };
  }
  return { sendAs: "text" };
}

/**
 * Decides whether and how a message may be sent (api-contract "Agents & messages"):
 * - customers (and leads) only with whatsappOptIn == true, otherwise not at all (null);
 * - money-related or first-contact customer messages wait for owner approval;
 * - owner / staff messages are queued directly.
 */
export function decideOutboxStatus(p: { audience: Audience; optIn?: boolean; moneyRelated?: boolean; firstContact?: boolean }): "queued" | "needs-approval" | null {
  if (p.audience !== "customer") return "queued";
  if (p.optIn !== true) return null;
  return p.moneyRelated || p.firstContact ? "needs-approval" : "queued";
}

/** Indian mobile numbers to WhatsApp format 91XXXXXXXXXX; null if it is not a usable mobile number. */
export function normalizeIndianPhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 10 && /^[6-9]/.test(d)) return `91${d}`;
  return null;
}

/** Safe Firestore id from a dedupe key. */
export function outboxId(dedupeKey: string): string {
  return dedupeKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300);
}

