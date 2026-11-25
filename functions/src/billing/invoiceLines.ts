/** Pure helpers to build invoice money fields from a quotation snapshot or a booking's menuSnapshot. */
import { CalcError, round2 } from "../calc/util";
import { invoiceTotals } from "../calc/gst";
import { splitGrossTotal } from "../calc/ops";
import { MenuPricing } from "../calc/menus";
import { fullQuote } from "../menus/fullQuote";
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { describeLine, MenuMeta, Bi, parseMenuPackage, parseQuoteRequest, QuoteRequest } from "../menus/menuPackage";
import { extraPlates } from "../calc/round7";

export interface LineItem {
  key: string;
  description: string;
  descriptionTe: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceMoney {
  lineItems: LineItem[];
  subtotal: number;
  discount: number;
  taxable: number;
  gstRate: number;
  isInterState: boolean;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  totalAmount: number;
}

/** A stored pricing snapshot + quote input → what quoteForMenu needs. */
export function partFromStored(pricingSnapshot: unknown, quoteInput: unknown): { pricing: MenuPricing; meta: MenuMeta; req: QuoteRequest } {
  const snap = asObj(pricingSnapshot);
  if (!Object.keys(snap).length) throw new CalcError("quotation has no pricing snapshot");
  const { pricing, meta } = parseMenuPackage({ ...snap, servingBoy: snap.servingBoy, extras: rebuildNamed(snap.extras, snap.extraNames), replacements: rebuildNamed(snap.replacements, snap.replacementNames) });
  return { pricing, meta: { ...meta, nameTe: asStr(snap.nameTe), nameEn: asStr(snap.nameEn) }, req: parseQuoteRequest(asObj(quoteInput)) };
}

/** Recompute from a server-written quotation (single menu, or R7-5 sessionQuotes), with today's GST rate. */
export function moneyFromQuotation(q: Doc, gstRate: number): InvoiceMoney {
  const sq = asArr(q.sessionQuotes).map(asObj);
  if (sq.length) {
    return moneyFromSessionParts(
      sq.map((x) => ({ sessionId: asStr(x.sessionId), label: { te: asStr(x.sessionNameTe), en: asStr(x.sessionNameEn) }, ...partFromStored(x.pricingSnapshot, x.quoteInput) })),
      gstRate,
    );
  }
  const p = partFromStored(q.pricingSnapshot, q.quoteInput);
  return moneyFromQuote(p.pricing, p.meta, p.req, gstRate);
}

export interface SessionPart {
  sessionId: string;
  label: Bi;
  pricing: MenuPricing;
  meta: MenuMeta;
  req: QuoteRequest;
}

/**
 * R7-5: one quotation / invoice over several meal sessions. Each session's lines come from §11 (labelled
 * "<session> — <line>"); discounts add up; GST (§1) is charged once on the summed subtotal.
 */
export function moneyFromSessionParts(parts: SessionPart[], gstRate: number): InvoiceMoney & { perSession: { sessionId: string; subtotal: number; plates: number; platesToCook: number; freePlates: number; belowMinimum: boolean; freeServingBoys: number; chargedServingBoys: number }[] } {
  if (!parts.length) throw new CalcError("at least one session is needed");
  const lineItems: LineItem[] = [];
  const perSession = parts.map((p) => {
    const q = fullQuote(p.pricing, p.meta, { ...p.req, gstRate: 0, discount: 0, isInterState: false });
    for (const l of q.lines) {
      const d = describeLine(l.item, p.meta);
      lineItems.push({ key: `${p.sessionId}:${l.item}`, description: `${p.label.en || p.sessionId} — ${d.en}`, descriptionTe: `${p.label.te || p.label.en || p.sessionId} — ${d.te}`, quantity: l.qty, unitPrice: l.rate, amount: l.amount });
    }
    return { sessionId: p.sessionId, subtotal: q.subtotal, plates: p.req.plates, platesToCook: q.platesToCook, freePlates: q.freePlates, belowMinimum: q.belowMinimum, freeServingBoys: q.freeServingBoys, chargedServingBoys: q.chargedServingBoys };
  });
  const subtotal = round2(perSession.reduce((a, x) => a + x.subtotal, 0));
  const discount = round2(parts.reduce((a, p) => a + (p.req.discount ?? 0), 0));
  const isInterState = parts[0].req.isInterState === true;
  const t = invoiceTotals(subtotal, gstRate, isInterState, discount);
  return { lineItems, subtotal, discount, taxable: t.taxable, gstRate, isInterState, cgstAmount: t.cgst, sgstAmount: t.sgst, igstAmount: t.igst, taxAmount: t.tax, totalAmount: t.total, perSession };
}

/** Extra lines (approved event extras, extra plates) added to the subtotal; totals recomputed with §1. */
export function withExtraLines(m: InvoiceMoney, extra: LineItem[]): InvoiceMoney {
  if (!extra.length) return m;
  const subtotal = round2(m.subtotal + extra.reduce((a, l) => a + l.amount, 0));
  const t = invoiceTotals(subtotal, m.gstRate, m.isInterState, m.discount);
  return { ...m, lineItems: [...m.lineItems, ...extra], subtotal, taxable: t.taxable, cgstAmount: t.cgst, sgstAmount: t.sgst, igstAmount: t.igst, taxAmount: t.tax, totalAmount: t.total };
}

/**
 * R7-7 invoice lines from the event: approved extras, and extra plates (§14) per session — guests beyond the
 * quoted plates at that session's plate price. Bookings without a quotation get no extra-plate lines.
 */
export function eventExtraLines(quotation: Doc | undefined, booking: Doc, extras: { id: string; data: Doc }[]): LineItem[] {
  const lines: LineItem[] = [];
  const sessions = asArr(booking.sessions).map(asObj);
  const sessionName = (id: string): Bi => {
    const s = sessions.find((x) => asStr(x.id) === id);
    return { te: asStr(s?.nameTe) || asStr(s?.nameEn) || id, en: asStr(s?.nameEn) || id };
  };
  if (quotation) {
    const sq = asArr(quotation.sessionQuotes).map(asObj);
    const plateLine = (key: string, label: Bi | null, actual: unknown, quoteInput: unknown, pricingSnapshot: unknown) => {
      if (typeof actual !== "number" || !Number.isInteger(actual) || actual <= 0) return;
      const quoted = asNum(asObj(quoteInput).plates);
      const price = asNum(asObj(pricingSnapshot).pricePerPlate);
      const x = extraPlates(actual, Number.isInteger(quoted) ? quoted : 0, price);
      if (x.qty > 0) lines.push({ key, description: `${label ? label.en + " — " : ""}Extra plates (guests above quote)`, descriptionTe: `${label ? label.te + " — " : ""}అదనపు ప్లేట్లు (quote కంటే ఎక్కువ అతిథులు)`, quantity: x.qty, unitPrice: price, amount: x.amount });
    };
    if (sq.length) {
      for (const q of sq) {
        const sid = asStr(q.sessionId);
        const s = sessions.find((x) => asStr(x.id) === sid);
        if (!s || s.status === "cancelled") continue;
        plateLine(`${sid}:extraPlates`, sessionName(sid), s.guestCountActual, q.quoteInput, q.pricingSnapshot);
      }
    } else {
      plateLine("extraPlates", null, booking.guestCountActual, quotation.quoteInput, quotation.pricingSnapshot);
    }
  }
  for (const e of extras) {
    if (asStr(e.data.status) !== "approved") continue;
    const sid = asStr(e.data.sessionId);
    const label = sid ? sessionName(sid) : null;
    const qty = asNum(e.data.qty);
    const rate = asNum(e.data.rate);
    lines.push({ key: `eventExtra:${e.id}`, description: `${label ? label.en + " — " : ""}Extra: ${asStr(e.data.item)}`, descriptionTe: `${label ? label.te + " — " : ""}అదనం: ${asStr(e.data.item)}`, quantity: qty, unitPrice: rate, amount: round2(qty * rate) });
  }
  return lines;
}

function rebuildNamed(list: unknown, names: unknown): Doc[] {
  const n = asObj(names);
  return asArr(list).map((x) => {
    const o = asObj(x);
    const b = asObj(n[asStr(o.key)]);
    return { ...o, te: asStr(b.te), en: asStr(b.en) };
  });
}

export function moneyFromQuote(pricing: MenuPricing, meta: MenuMeta, req: ReturnType<typeof parseQuoteRequest>, gstRate: number): InvoiceMoney {
  const quote = fullQuote(pricing, meta, { ...req, gstRate });
  const lineItems = quote.lines.map((l) => {
    const d: Bi = describeLine(l.item, meta);
    return { key: l.item, description: d.en, descriptionTe: d.te, quantity: l.qty, unitPrice: l.rate, amount: l.amount };
  });
  return {
    lineItems,
    subtotal: quote.subtotal,
    discount: req.discount ?? 0,
    taxable: quote.totals.taxable,
    gstRate,
    isInterState: req.isInterState === true,
    cgstAmount: quote.totals.cgst,
    sgstAmount: quote.totals.sgst,
    igstAmount: quote.totals.igst,
    taxAmount: quote.totals.tax,
    totalAmount: quote.totals.total,
  };
}

/** Old-style bookings (Android): menuSnapshot [{name, pricePerPlate}] × guests. */
export function moneyFromMenuSnapshot(booking: Doc, gstRate: number): InvoiceMoney {
  const items = asArr(booking.menuSnapshot).map(asObj);
  if (!items.length) throw new CalcError("booking has no menu items");
  const guests = asNum(booking.guestCountConfirmed) || asNum(booking.guestCount);
  if (!Number.isInteger(guests) || guests < 1) throw new CalcError("booking guest count must be a whole number ≥ 1");
  const lineItems = items.map((it, i) => {
    const rate = asNum(it.pricePerPlate, NaN);
    if (!Number.isFinite(rate) || rate < 0) throw new CalcError(`menu item ${i + 1}: price per plate must be ≥ 0`);
    const name = asStr(it.name) || `Item ${i + 1}`;
    return { key: `menuItem:${asStr(it.itemId) || i}`, description: name, descriptionTe: name, quantity: guests, unitPrice: rate, amount: round2(guests * rate) };
  });
  const subtotal = round2(lineItems.reduce((a, l) => a + l.amount, 0));
  const discount = Math.max(0, asNum(booking.discount));
  const isInterState = booking.isInterState === true;
  const t = invoiceTotals(subtotal, gstRate, isInterState, discount);
  return { lineItems, subtotal, discount, taxable: t.taxable, gstRate, isInterState, cgstAmount: t.cgst, sgstAmount: t.sgst, igstAmount: t.igst, taxAmount: t.tax, totalAmount: t.total };
}

/** calc §2 status → the label stored in Firestore (Android InvoiceStatus: "PartiallyPaid"). */
export function storedPaymentStatus(s: "Paid" | "Partially Paid"): "Paid" | "PartiallyPaid" {
  return s === "Paid" ? "Paid" : "PartiallyPaid";
}

/** Same lines, but a typed total: tax fields re-split from the GST-inclusive total; `adjustment` = manual − automatic. */
export function withManualTotal(m: InvoiceMoney, total: number): InvoiceMoney & { adjustment: number } {
  const t = splitGrossTotal(total, m.gstRate, m.isInterState);
  return { ...m, taxable: t.taxable, cgstAmount: t.cgst, sgstAmount: t.sgst, igstAmount: t.igst, taxAmount: t.tax, totalAmount: t.total, adjustment: round2(t.total - m.totalAmount) };
}
