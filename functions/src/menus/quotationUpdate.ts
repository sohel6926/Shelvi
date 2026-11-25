/**
 * Pure: which fields an update of an existing quotation writes (contract audit fix 3).
 * notes, bookingId and validDays/validUntil keep their stored values unless the request sends them;
 * the original issueDate is always kept on update.
 */
export function quotationUpdateFields<T extends Record<string, unknown>>(fields: T, sent: { notes: boolean; validDays: boolean; bookingId: boolean }): Partial<T> {
  const out: Record<string, unknown> = { ...fields };
  delete out.issueDate;
  if (!sent.notes) delete out.notes;
  if (!sent.bookingId) delete out.bookingId;
  if (!sent.validDays) {
    delete out.validDays;
    delete out.validUntil;
  }
  return out as Partial<T>;
}
