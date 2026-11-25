/**
 * Module 4g (19 Nov 2026) — month-close checklist. Pure rules; tested in test/module4k.test.ts.
 *
 * Before a month is locked the owner should know what is still loose in it. This file turns counts taken from the
 * CRM's own documents into a short list: each line is done, to do, or stops the lock. It only reports — locking is
 * still the owner's click (lockPeriod), and nothing here prevents it.
 */
type AnyDoc = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type CloseState = "ok" | "todo" | "block" | "info";
export interface CloseItem {
  key: string;
  state: CloseState;
  count: number;
  amount: number;
  te: string;
  en: string;
  /** the web page where it is fixed ("" = nowhere to go) */
  link: string;
}

export interface CloseInput {
  month: string;
  booksBalanced: boolean;
  booksSkipped: number;
  eventsWithoutInvoice: number;
  draftInvoices: number;
  heldBills: number;
  heldBillsAmount: number;
  openOrders: number;
  pendingStockAdjusts: number;
  staffWithoutPayslip: number;
  unpaidSalaries: number;
  unpaidSalariesAmount: number;
  /** "YYYY-MM" the books are locked through ("" = never locked) */
  lockedThrough: string;
  previousMonth: string;
}

const item = (key: string, state: CloseState, count: number, amount: number, te: string, en: string, link = ""): CloseItem => ({ key, state, count, amount: r2(amount), te, en, link });

export function buildCloseChecklist(x: CloseInput): { items: CloseItem[]; ready: boolean; todo: number; alreadyLocked: boolean } {
  const alreadyLocked = x.lockedThrough !== "" && x.lockedThrough >= x.month;
  const items: CloseItem[] = [
    x.booksBalanced && x.booksSkipped === 0
      ? item("books", "ok", 0, 0, "ఖాతా పుస్తకం సరిగ్గా ఉంది (జమ = ఖర్చు)", "The books balance")
      : item("books", "block", x.booksSkipped, 0, "ఖాతా పుస్తకం సరిపోవడం లేదు — లాక్ చేసే ముందు ఇది సరిచేయాలి", "The books do not balance — fix this before locking", "/books"),
    x.eventsWithoutInvoice
      ? item("events", "todo", x.eventsWithoutInvoice, 0, `ఇన్వాయిస్ చేయని కార్యక్రమాలు: ${x.eventsWithoutInvoice}`, `Events with no invoice: ${x.eventsWithoutInvoice}`, "/bookings")
      : item("events", "ok", 0, 0, "ఈ నెల కార్యక్రమాలన్నింటికీ ఇన్వాయిస్ ఉంది", "Every event of the month has an invoice"),
    x.draftInvoices
      ? item("drafts", "todo", x.draftInvoices, 0, `ఇంకా Draft లో ఉన్న ఇన్వాయిస్‌లు: ${x.draftInvoices}`, `Invoices still in Draft: ${x.draftInvoices}`, "/invoices")
      : item("drafts", "ok", 0, 0, "Draft ఇన్వాయిస్‌లు లేవు", "No draft invoices"),
    x.heldBills
      ? item("heldBills", "todo", x.heldBills, x.heldBillsAmount, `ఆగిన సరఫరాదారు బిల్లులు: ${x.heldBills} (₹${r2(x.heldBillsAmount)})`, `Vendor bills on hold: ${x.heldBills} (₹${r2(x.heldBillsAmount)})`, "/procurement")
      : item("heldBills", "ok", 0, 0, "ఆగిన సరఫరాదారు బిల్లులు లేవు", "No vendor bills on hold"),
    x.openOrders
      ? item("orders", "todo", x.openOrders, 0, `ఇంకా ముగియని కొనుగోలు ఆర్డర్లు: ${x.openOrders}`, `Purchase orders still open: ${x.openOrders}`, "/procurement")
      : item("orders", "ok", 0, 0, "ఈ నెల కొనుగోలు ఆర్డర్లన్నీ ముగిశాయి", "All purchase orders of the month are finished"),
    x.pendingStockAdjusts
      ? item("stock", "todo", x.pendingStockAdjusts, 0, `ఆమోదం కోసం ఆగిన స్టాక్ సవరణలు: ${x.pendingStockAdjusts}`, `Stock adjustments waiting for approval: ${x.pendingStockAdjusts}`, "/inventory")
      : item("stock", "ok", 0, 0, "ఆగిన స్టాక్ సవరణలు లేవు", "No stock adjustments waiting"),
    x.staffWithoutPayslip
      ? item("payroll", "todo", x.staffWithoutPayslip, 0, `జీతం ఖరారు కాని సిబ్బంది: ${x.staffWithoutPayslip}`, `Staff whose pay is not finalized: ${x.staffWithoutPayslip}`, "/payroll")
      : item("payroll", "ok", 0, 0, "ఈ నెల జీతాలు ఖరారు అయ్యాయి", "The month's payroll is finalized"),
    x.unpaidSalaries
      ? item("salaries", "info", x.unpaidSalaries, x.unpaidSalariesAmount, `ఇంకా ఇవ్వని జీతాలు: ${x.unpaidSalaries} మందికి ₹${r2(x.unpaidSalariesAmount)} (తర్వాత నెలలో ఇచ్చినా పర్వాలేదు)`, `Salaries not yet paid: ₹${r2(x.unpaidSalariesAmount)} to ${x.unpaidSalaries} people (paying next month is fine)`, "/payroll")
      : item("salaries", "ok", 0, 0, "ఈ నెల జీతాలన్నీ ఇచ్చేశారు", "All salaries of the month are paid"),
    x.lockedThrough >= x.previousMonth && x.lockedThrough !== ""
      ? item("previous", "ok", 0, 0, `ముందు నెల (${x.previousMonth}) లాక్ అయింది`, `The month before (${x.previousMonth}) is locked`)
      : item("previous", "info", 0, 0, `ముందు నెల (${x.previousMonth}) ఇంకా లాక్ కాలేదు — ఈ నెల లాక్ చేస్తే అదీ లాక్ అవుతుంది`, `The month before (${x.previousMonth}) is not locked yet — locking this month locks it too`),
  ];
  const todo = items.filter((i) => i.state === "todo").length;
  return { items, ready: !items.some((i) => i.state === "block") && todo === 0, todo, alreadyLocked };
}

// ---- counting helpers (take plain documents so they can be tested) --------------------------------------------------

const inMonth = (day: string | null, month: string) => !!day && day.slice(0, 7) === month;

/** Events of the month (not cancelled) that no live invoice points at. */
export function countEventsWithoutInvoice(bookings: { id: string; day: string | null; status: string }[], invoices: AnyDoc[], month: string): number {
  const invoiced = new Set(invoices.filter((i) => !["Void", "Cancelled"].includes(str(i.status)) && i.isDeleted !== true).map((i) => str(i.bookingId)).filter(Boolean));
  return bookings.filter((b) => inMonth(b.day, month) && b.status !== "Cancelled" && !invoiced.has(b.id)).length;
}

/** Payslips of the month: who has attendance but no finalized payslip, and what is finalized but not handed over. */
export function payrollGaps(staffWithAttendance: string[], payslips: AnyDoc[], month: string): { withoutPayslip: number; unpaid: number; unpaidAmount: number } {
  const mine = payslips.filter((p) => str(p.month) === month && p.finalized === true);
  const done = new Set(mine.map((p) => str(p.staffId)));
  let unpaid = 0;
  let unpaidAmount = 0;
  for (const p of mine) {
    const due = r2(Math.max(0, num(p.net) - Math.max(0, num(p.paidTotal))));
    if (due > 0.005) {
      unpaid++;
      unpaidAmount = r2(unpaidAmount + due);
    }
  }
  return { withoutPayslip: [...new Set(staffWithAttendance)].filter((s) => !done.has(s)).length, unpaid, unpaidAmount };
}
