/** Module 1e (18 Nov 2026) — team notes on a lead ("lead chat"). Pure rules, no Firestore. */

export const COMMENT_MAX_LENGTH = 2000;
export const COMMENT_MAX_MENTIONS = 20;

/** Trimmed text, or null when it is empty or too long. */
export function cleanComment(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  return t.length >= 1 && t.length <= COMMENT_MAX_LENGTH ? t : null;
}

/** Mentions as sent by the client → unique user ids, or null when the list is not valid. */
export function cleanMentions(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > COMMENT_MAX_MENTIONS) return null;
  if (!raw.every((u) => typeof u === "string" && u.length > 0 && u.length <= 128 && !u.includes("/"))) return null;
  return [...new Set(raw as string[])];
}

/**
 * Who is told about a new note: the people mentioned and the person who has the lead — never the author,
 * and only people who can open leads (`eligible` = active admins / managers).
 */
export function commentRecipients(input: { mentions: readonly string[]; assignedTo: string; authorUid: string; eligible: readonly string[] }): string[] {
  const ok = new Set(input.eligible);
  const out = new Set<string>();
  for (const u of [...input.mentions, input.assignedTo]) if (u && u !== input.authorUid && ok.has(u)) out.add(u);
  return [...out];
}

/** "HH:MM" 24-hour, or "" — the optional follow-up time of day on a lead. */
export function isFollowUpTime(v: unknown): boolean {
  return v === "" || (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
}
