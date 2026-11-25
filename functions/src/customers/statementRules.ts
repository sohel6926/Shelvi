/** Pure: R10-7 customer statement entries from bookings / invoices / payments, and the WhatsApp text. */
import { asNum, asStr, Doc } from "../shared/coerce";
import { dayOfValue, formatDayTe } from "../shared/istDate";
import { isLiveRecord } from "../shared/costTarget";
import { formatRupees } from "../shared/templates";
import { StatementEntry } from "../calc/round10";
import { round2 } from "../calc/util";

export function statementEntries(bookings: { id: string; data: Doc }[], invoices: { id: string; data: Doc; payments: { id: string; data: Doc }[] }[]): StatementEntry[] {
  const out: StatementEntry[] = [];
  for (const b of bookings) {
    if (b.data.isDeleted === true) continue;
    const day = dayOfValue(b.data.createdAt) ?? dayOfValue(b.data.eventDate);
    if (!day) continue;
    const ev = dayOfValue(b.data.eventDate);
    const cancelled = asStr(b.data.status) === "Cancelled";
    out.push({ day, kind: "booking", ref: b.id, amount: 0, te: `ఆర్డర్ ${ev ? formatDayTe(ev) : ""}${cancelled ? " (రద్దు)" : ""}`.trim(), en: `Order ${ev ?? ""}${cancelled ? " (cancelled)" : ""}`.trim() });
  }
  for (const inv of invoices) {
    const d = inv.data;
    const status = asStr(d.status);
    if (status === "Void" || d.isDeleted === true) continue;
    const num = asStr(d.invoiceNumber) || inv.id;
    const issue = dayOfValue(d.issueDate) ?? dayOfValue(d.createdAt);
    if (status === "Cancelled") {
      const charge = round2(Math.max(0, asNum(d.cancellationCharge)));
      const day = dayOfValue(d.cancelledAt) ?? issue;
      if (charge > 0 && day) out.push({ day, kind: "cancellation-charge", ref: num, amount: charge, te: `రద్దు చార్జీ (${num})`, en: `Cancellation charge (${num})` });
    } else if (issue) {
      out.push({ day: issue, kind: "invoice", ref: num, amount: round2(Math.max(0, asNum(d.totalAmount))), te: `బిల్ ${num}`, en: `Invoice ${num}` });
    }
    for (const p of inv.payments) {
      if (!isLiveRecord(p.data)) continue;
      const amt = round2(asNum(p.data.amount));
      const day = asStr(p.data.day) || dayOfValue(p.data.date);
      if (!day || amt === 0) continue;
      const method = asStr(p.data.method);
      if (amt > 0) out.push({ day, kind: "payment", ref: `${num}/${p.id}`, amount: -amt, te: `చెల్లింపు${method ? ` (${method})` : ""} — ${num}`, en: `Payment${method ? ` (${method})` : ""} — ${num}` });
      else out.push({ day, kind: "refund", ref: `${num}/${p.id}`, amount: -amt, te: `తిరిగి ఇచ్చింది — ${num}`, en: `Refund — ${num}` });
    }
  }
  return out;
}

export function statementText(p: { customer: string; business: string; from: string | null; to: string | null; opening: number; lines: (StatementEntry & { balance: number })[]; closing: number }): string {
  const head = [`${p.business} — ఖాతా వివరాలు`, `${p.customer} గారు`];
  if (p.from || p.to) head.push(`${p.from ? formatDayTe(p.from) : "మొదటి నుండి"} → ${p.to ? formatDayTe(p.to) : "ఈ రోజు"}`);
  if (p.from) head.push(`ముందు బాకీ: ${formatRupees(p.opening)}`);
  const body = p.lines.filter((l) => l.amount !== 0).map((l) => `${formatDayTe(l.day)}  ${l.te}  ${l.amount > 0 ? "+" : "−"}${formatRupees(Math.abs(l.amount))}  = ${formatRupees(l.balance)}`);
  const tail = p.closing > 0 ? `మొత్తం బాకీ: ${formatRupees(p.closing)}` : p.closing < 0 ? `మీకు తిరిగి రావాల్సింది: ${formatRupees(-p.closing)}` : "బాకీ ఏమీ లేదు. ధన్యవాదాలు!";
  return [...head, "", ...body, "", tail].join("\n");
}
