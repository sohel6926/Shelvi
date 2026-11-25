import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { effectiveGstRate, invoiceDocTitle, issuerLine, loadSettings } from "../shared/settings";
import { istNoon, todayIST, toDateValue } from "../shared/istDate";
import { reserveNumber } from "../shared/counters";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { buildUpiPayload } from "../integrations/upi";
import { eventExtraLines, InvoiceMoney, moneyFromMenuSnapshot, moneyFromQuotation, withExtraLines, withManualTotal } from "./invoiceLines";
import { auditOverride, autoFields, manualFields, readManual } from "../shared/override";

async function pickQuotation(booking: Doc, bookingId: string): Promise<{ id: string; data: Doc } | null> {
  const db = getFirestore();
  const qid = asStr(booking.quotationId);
  if (qid) {
    const s = await db.collection(FirestoreCollections.QUOTATIONS).doc(qid).get();
    if (s.exists) return { id: s.id, data: s.data() as Doc };
  }
  const snap = await db.collection(FirestoreCollections.QUOTATIONS).where("bookingId", "==", bookingId).get();
  const priced = (q: Doc) => !!q.pricingSnapshot || (Array.isArray(q.sessionQuotes) && q.sessionQuotes.length > 0);
  const withSnapshot = snap.docs.filter((d) => priced(d.data() as Doc) && !["Rejected", "Cancelled"].includes(asStr(d.data().status)));
  if (!withSnapshot.length) return null;
  const ms = (d: Doc) => toDateValue(d.updatedAt ?? d.createdAt)?.getTime() ?? 0;
  withSnapshot.sort((a, b) => Number(asStr(b.data().status) === "Accepted") - Number(asStr(a.data().status) === "Accepted") || ms(b.data()) - ms(a.data()));
  return { id: withSnapshot[0].id, data: withSnapshot[0].data() };
}

export const generateInvoiceFromBooking = callable("generateInvoiceFromBooking", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const bookingId = reqId(data, "bookingId");
  const bookingRef = db.collection(c.BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  const booking = bookingSnap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(booking.branchId));
  if (asStr(booking.status) === "Cancelled") fail("failed-precondition", "Cancel అయిన booking కి invoice చేయలేము.", "Booking is cancelled.");
  if (booking.closed) fail("failed-precondition", "ఈ event close అయింది — ముందు reopen చేయండి.", "This event is closed; reopen it first.");

  const settings = await loadSettings();
  const gstRate = effectiveGstRate(settings);
  const quotation = await pickQuotation(booking, bookingId);
  let money: InvoiceMoney;
  if (quotation) money = moneyFromQuotation(quotation.data, gstRate);
  else if (Array.isArray(booking.menuSnapshot) && booking.menuSnapshot.length) money = moneyFromMenuSnapshot(booking, gstRate);
  else fail("failed-precondition", "ఈ booking కి quotation గానీ menu గానీ లేదు.", "Booking has no quotation or menu to invoice.");

  // R7-7: approved event extras and extra plates (guests above the quote) as separate labelled lines.
  const extrasSnap = await bookingRef.collection(c.EVENT_EXTRAS).get();
  money = withExtraLines(money, eventExtraLines(quotation?.data, booking, extrasSnap.docs.map((d) => ({ id: d.id, data: d.data() as Doc }))));
  const manual = readManual(data.manual, ["total"], caller, settings, "invoice");
  const autoTotal = money.totalAmount;
  if (manual) money = withManualTotal(money, manual.values.total);
  const modeFields = manual ? manualFields(caller, autoTotal, manual.reason) : autoFields(autoTotal);
  const customerName = asStr(booking.customerNameSnapshot);
  const today = todayIST();
  const year = Number(today.slice(0, 4));
  const eventAt = toDateValue(booking.eventDate);

  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection(c.INVOICES).where("bookingId", "==", bookingId));
    const open = existing.docs.filter((d) => !["Cancelled", "Void"].includes(asStr(d.data().status)));
    if (open.some((d) => asNum(d.data().amountPaid) > 0)) {
      fail("failed-precondition", "ఈ booking invoice కి ఇప్పటికే payment వచ్చింది — కొత్త invoice చేయలేము.", "This booking's invoice already has payments.");
    }
    const reuse = open[0];
    const invoiceNumber = reuse ? asStr(reuse.data().invoiceNumber) : await reserveNumber(tx, "invoice", year);
    const ref = reuse ? reuse.ref : db.collection(c.INVOICES).doc();
    const fields = {
      ...money,
      ...modeFields,
      bookingId,
      customerId: asStr(booking.customerId),
      customerNameSnapshot: customerName,
      quotationId: quotation?.id ?? "",
      invoiceNumber,
      docTitle: invoiceDocTitle(settings),
      issuerLine: issuerLine(settings),
      terms: settings.invoiceTerms,
      gstin: settings.gstRegistered ? settings.gstin : "",
      issueDate: Timestamp.fromDate(istNoon(today)),
      dueDate: eventAt ? Timestamp.fromDate(eventAt) : null,
      amountPaid: 0,
      balanceDue: money.totalAmount,
      status: money.totalAmount === 0 ? "Paid" : "Draft",
      upiQrPayload: buildUpiPayload({ upiId: settings.upiId, payeeName: settings.name, amount: money.totalAmount, note: invoiceNumber }),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (reuse) tx.update(ref, { ...fields, updatedBy: caller.uid });
    // Module 5b: a new invoice keeps the booking's company and brand as they are today (brand rule 9)
    else tx.set(ref, { ...fields, branchId: asStr(booking.branchId) || caller.branchId, companyId: asStr(booking.companyId), brandId: asStr(booking.brandId), createdBy: caller.uid, createdAt: FieldValue.serverTimestamp() });
    tx.update(bookingRef, { invoiceId: ref.id, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
    if (quotation) tx.update(db.collection(c.QUOTATIONS).doc(quotation.id), { invoiceId: ref.id, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
    return { invoiceId: ref.id, invoiceNumber };
  });

  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "generateInvoiceFromBooking", collection: c.INVOICES, docId: result.invoiceId, after: { totalAmount: money.totalAmount, bookingId } });
  if (manual) await auditOverride(caller, "generateInvoiceFromBooking:manualTotal", c.INVOICES, result.invoiceId, autoTotal, money.totalAmount, manual.reason);
  return result;
});
