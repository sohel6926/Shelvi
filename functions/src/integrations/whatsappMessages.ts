/** Pure WhatsApp Cloud API helpers (unit tested). */
const PLACEHOLDERS = new Set(["", "none", "-", "x", "todo", "changeme"]);

export function isConfigured(token: string | undefined, phoneId: string | undefined): boolean {
  const t = (token ?? "").trim();
  const p = (phoneId ?? "").trim();
  return !PLACEHOLDERS.has(t.toLowerCase()) && !PLACEHOLDERS.has(p.toLowerCase()) && /^\d+$/.test(p);
}

/** Free-form text message body (allowed inside the 24-hour customer service window). */
export function buildTextMessageBody(to: string, text: string): Record<string, unknown> {
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: text } };
}

/** Approved-template message body (needed for business-initiated messages outside the 24-hour window). */
export function buildTemplateMessageBody(to: string, templateName: string, languageCode: string, bodyParams: string[]): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParams.length ? [{ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t })) }] : [],
    },
  };
}

/** Meta template names cannot contain dots: owner.alert → suseela_owner_alert. */
export function metaTemplateName(key: string): string {
  return `suseela_${key.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
}

