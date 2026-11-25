/**
 * UPI deep link / QR payload for invoices (stored as invoices.upiQrPayload).
 *   upi://pay?pa=<upiId>&pn=<payee name>&am=<amount>&cu=INR&tn=<note>
 * Any QR library can turn the string into the printed QR code.
 */
const UPI_ID_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

export function isValidUpiId(upiId: string): boolean {
  return UPI_ID_RE.test(upiId.trim());
}

function enc(v: string): string {
  return encodeURIComponent(v);
}

export interface UpiInput {
  upiId: string;
  payeeName: string;
  amount: number;
  note: string;
}

/** Returns null when there is nothing to collect or no valid UPI ID is set up yet. */
export function buildUpiPayload(p: UpiInput): string | null {
  const upiId = p.upiId.trim();
  if (!isValidUpiId(upiId)) return null;
  if (!Number.isFinite(p.amount) || p.amount < 0.01) return null;
  const name = p.payeeName.trim().slice(0, 50) || "Suseela Caterings";
  const note = p.note.trim().slice(0, 50);
  const parts = [`pa=${enc(upiId).replace(/%40/g, "@")}`, `pn=${enc(name)}`, `am=${p.amount.toFixed(2)}`, "cu=INR"];
  if (note) parts.push(`tn=${enc(note)}`);
  return `upi://pay?${parts.join("&")}`;
}
