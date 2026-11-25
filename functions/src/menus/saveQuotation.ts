import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optId, optNum, optString, reqId } from "../shared/validate";
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { addDays, istNoon, todayIST } from "../shared/istDate";
import { invoiceDocTitle, issuerLine } from "../shared/settingsModel";
import { effectiveGstRate, loadSettings } from "../shared/settings";
import { auditOverride, autoFields, manualFields, readManual } from "../shared/override";
import { splitGrossTotal } from "../calc/ops";
import { round2 } from "../calc/util";
import { reserveNumber } from "../shared/counters";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { chooseOptions, describeLine, parseQuoteRequest } from "./menuPackage";
import { computeQuote } from "./quoteMenu";
import { quotationUpdateFields } from "./quotationUpdate";
import { versionBump } from "./quotationVersions";
import { NO_BRANCH_ERROR, resolveBranchId } from "../shared/branch";
import { moneyFromSessionParts } from "../billing/invoiceLines";

function pricingSnapshotOf(menu: Awaited<ReturnType<typeof computeQuote>>["menu"]): Doc {
  return { ...menu.pricing, nameTe: menu.meta.nameTe, nameEn: menu.meta.nameEn, extraNames: menu.meta.extraNames, replacementNames: menu.meta.replacementNames, menuDate: menu.meta.menuDate, transportCharged: menu.meta.transportCharged, kidsPrice: menu.meta.kidsPrice };
}

/**
 * saveQuotation — single menu: { menuPackageId, selections, quote }; R7-5 sessions: { bookingId, sessions:
 * [{ sessionId, menuPackageId, selections, quote }] } → one quotation with line items labelled by session.
 * R7-10: editing a quotation that is Sent / Accepted keeps the old one in quotations/{id}/versions/{n},
 * bumps `version` and makes the new version a Draft (to be sent again).
 */
export const saveQuotation = callable("saveQuotation", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const quotationId = optId(data, "quotationId");
  const customerId = reqId(data, "customerId");
  const bookingId = optId(data, "bookingId");
  const validDaysSent = optNum(data, "validDays", { int: true, min: 1, max: 90 });
  const validDays = validDaysSent ?? 15;
  const notesSent = optString(data, "notes", 2000);
  const notes = notesSent ?? "";
  const sessionsRaw = asArr(data.sessions);

  const customerSnap = await db.collection(c.CUSTOMERS).doc(customerId).get();
  if (!customerSnap.exists) fail("not-found", "Customer దొరకలేదు.", "Customer not found.");
  const customer = customerSnap.data() as Doc;
  // Branch: the booking's; without a booking the client's selected branchId, else the caller's own (fix 9).
  let branchId = resolveBranchId(optId(data, "branchId"), caller.branchId) ?? "";
  let booking: Doc | undefined;
  if (bookingId) {
    const b = await db.collection(c.BOOKINGS).doc(bookingId).get();
    if (!b.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
    booking = b.data() as Doc;
    branchId = asStr(booking.branchId) || branchId;
  }
  if (!quotationId) {
    if (!branchId) fail("invalid-argument", NO_BRANCH_ERROR.te, NO_BRANCH_ERROR.en);
    assertAdminOrOwnBranch(caller, branchId);
  } else if (bookingId) {
    assertAdminOrOwnBranch(caller, branchId);
  }

  // ---- money core: one menu, or one part per session -------------------------------------------------------
  let core: Doc;
  let autoTotal: number;
  let gstRate: number;
  let isInterState: boolean;
  const settings = await loadSettings();
  if (sessionsRaw.length) {
    if (!booking) fail("invalid-argument", "Sessions తో quotation కి booking కావాలి.", "A quotation with sessions needs bookingId.");
    const bookingSessions = asArr(booking.sessions).map(asObj);
    const seen = new Set<string>();
    const parts = [];
    const sessionQuotes: Doc[] = [];
    for (const [i, raw] of sessionsRaw.entries()) {
      const o = asObj(raw);
      const sessionId = asStr(o.sessionId);
      const s = bookingSessions.find((x) => asStr(x.id) === sessionId);
      if (!s) fail("invalid-argument", `Session ${sessionId || i + 1} ఈ booking లో లేదు.`, `sessions[${i}].sessionId is not a session of this booking.`);
      if (seen.has(sessionId)) fail("invalid-argument", "ఒకే session రెండుసార్లు ఉంది.", "The same session is listed twice.");
      seen.add(sessionId);
      const menuPackageId = reqId(o, "menuPackageId");
      const req = parseQuoteRequest(asObj(o.quote));
      const q = await computeQuote(menuPackageId, req);
      const label = { te: asStr(s.nameTe) || asStr(s.nameEn) || sessionId, en: asStr(s.nameEn) || sessionId };
      parts.push({ sessionId, label, pricing: q.menu.pricing, meta: q.menu.meta, req });
      sessionQuotes.push({ sessionId, sessionNameTe: label.te, sessionNameEn: label.en, menuPackageId, menuNameTe: q.menu.meta.nameTe, menuNameEn: q.menu.meta.nameEn, selections: o.selections, menuChoices: chooseOptions(q.menu.meta, o.selections), quoteInput: req, pricingSnapshot: pricingSnapshotOf(q.menu) });
    }
    gstRate = effectiveGstRate(settings);
    const m = moneyFromSessionParts(parts, gstRate);
    sessionQuotes.forEach((sq, i) => Object.assign(sq, { subtotal: m.perSession[i].subtotal, platesToCook: m.perSession[i].platesToCook, freePlates: m.perSession[i].freePlates, belowMinimum: m.perSession[i].belowMinimum }));
    isInterState = m.isInterState;
    autoTotal = m.totalAmount;
    core = {
      menuPackageId: asStr(sessionQuotes[0].menuPackageId),
      sessionQuotes,
      lineItems: m.lineItems,
      plates: m.perSession.reduce((a, x) => a + x.plates, 0),
      platesToCook: m.perSession.reduce((a, x) => a + x.platesToCook, 0),
      freePlates: m.perSession.reduce((a, x) => a + x.freePlates, 0),
      freeServingBoys: m.perSession.reduce((a, x) => a + x.freeServingBoys, 0),
      chargedServingBoys: m.perSession.reduce((a, x) => a + x.chargedServingBoys, 0),
      belowMinimum: m.perSession.some((x) => x.belowMinimum),
      subtotal: m.subtotal,
      discount: m.discount,
      taxable: m.taxable,
      cgstAmount: m.cgstAmount,
      sgstAmount: m.sgstAmount,
      igstAmount: m.igstAmount,
      taxAmount: m.taxAmount,
      totalAmount: m.totalAmount,
    };
  } else {
    const menuPackageId = reqId(data, "menuPackageId");
    const req = parseQuoteRequest(asObj(data.quote));
    const q = await computeQuote(menuPackageId, req);
    gstRate = q.gstRate;
    isInterState = req.isInterState === true;
    autoTotal = q.quote.totals.total;
    core = {
      menuPackageId,
      sessionQuotes: [],
      menuNameTe: q.menu.meta.nameTe,
      menuNameEn: q.menu.meta.nameEn,
      menuChoices: chooseOptions(q.menu.meta, data.selections),
      selections: data.selections,
      quoteInput: req,
      pricingSnapshot: pricingSnapshotOf(q.menu),
      lineItems: q.quote.lines.map((l) => {
        const d = describeLine(l.item, q.menu.meta);
        return { key: l.item, description: d.en, descriptionTe: d.te, quantity: l.qty, unitPrice: l.rate, amount: l.amount };
      }),
      plates: req.plates,
      platesToCook: q.quote.platesToCook,
      freePlates: q.quote.freePlates,
      freeServingBoys: q.quote.freeServingBoys,
      chargedServingBoys: q.quote.chargedServingBoys,
      belowMinimum: q.quote.belowMinimum,
      subtotal: q.quote.subtotal,
      discount: req.discount ?? 0,
      taxable: q.quote.totals.taxable,
      cgstAmount: q.quote.totals.cgst,
      sgstAmount: q.quote.totals.sgst,
      igstAmount: q.quote.totals.igst,
      taxAmount: q.quote.totals.tax,
      totalAmount: q.quote.totals.total,
    };
  }
  const manual = readManual(data.manual, ["total"], caller, settings, "quotation");

  function moneyMode(): Doc {
    if (!manual) return { ...autoFields(autoTotal), adjustment: 0 };
    const t = splitGrossTotal(manual.values.total, gstRate, isInterState);
    return { taxable: t.taxable, cgstAmount: t.cgst, sgstAmount: t.sgst, igstAmount: t.igst, taxAmount: t.tax, totalAmount: t.total, adjustment: round2(t.total - autoTotal), ...manualFields(caller, autoTotal, manual.reason) };
  }

  const today = todayIST();
  const year = Number(today.slice(0, 4));
  const fields: Doc = {
    customerId,
    customerNameSnapshot: asStr(customer.name),
    bookingId: bookingId ?? "",
    ...core,
    gstRate,
    isInterState,
    issueDate: Timestamp.fromDate(istNoon(today)),
    validUntil: Timestamp.fromDate(istNoon(addDays(today, validDays))),
    validDays,
    notes,
    docTitle: invoiceDocTitle(settings),
    issuerLine: issuerLine(settings),
    ...moneyMode(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const result = await db.runTransaction(async (tx) => {
    if (quotationId) {
      const ref = db.collection(c.QUOTATIONS).doc(quotationId);
      const snap = await tx.get(ref);
      if (!snap.exists) fail("not-found", "Quotation దొరకలేదు.", "Quotation not found.");
      const existing = snap.data() as Doc;
      assertAdminOrOwnBranch(caller, asStr(existing.branchId));
      if (asStr(existing.status) === "Cancelled") fail("failed-precondition", "రద్దు అయిన quotation మార్చలేము.", "This quotation is cancelled.");
      if (asStr(existing.status) === "Accepted" && asStr(existing.invoiceId)) {
        fail("failed-precondition", "ఈ quotation నుండి ఇప్పటికే invoice వచ్చింది — మార్చలేము.", "This quotation already has an invoice.");
      }
      const bump = versionBump(existing);
      if (bump.snapshotVersion !== null) tx.set(ref.collection(c.QUOTATION_VERSIONS).doc(String(bump.snapshotVersion)), { ...existing, version: bump.snapshotVersion, versionSavedAt: FieldValue.serverTimestamp(), versionSavedBy: caller.uid });
      tx.update(ref, { ...quotationUpdateFields(fields, { notes: notesSent !== undefined, validDays: validDaysSent !== undefined, bookingId: bookingId !== undefined }), version: bump.version, ...(bump.status ? { status: bump.status } : {}), updatedBy: caller.uid });
      return { quotationId, quotationNumber: asStr(existing.quotationNumber), version: bump.version, created: false };
    }
    const quotationNumber = await reserveNumber(tx, "quotation", year);
    const ref = db.collection(c.QUOTATIONS).doc();
    tx.set(ref, { ...fields, quotationNumber, version: 1, status: "Draft", branchId, createdBy: caller.uid, createdAt: FieldValue.serverTimestamp() });
    return { quotationId: ref.id, quotationNumber, version: 1, created: true };
  });

  // History: a new quotation reads "కొటేషన్ తయారు", an edit "కొటేషన్ మార్చారు" (with sessions count / version).
  const sessionsNote = sessionsRaw.length ? { te: ` (${sessionsRaw.length} భోజనాలు)`, en: ` (${sessionsRaw.length} sessions)` } : { te: "", en: "" };
  await writeAuditEntry({
    uid: caller.uid,
    role: caller.role,
    action: result.created ? "create" : "saveQuotation",
    collection: c.QUOTATIONS,
    docId: result.quotationId,
    after: { quotationNumber: result.quotationNumber, totalAmount: fields.totalAmount, version: result.version, sessions: sessionsRaw.length },
    summary: result.created
      ? { te: `కొటేషన్ తయారు ${result.quotationNumber}${sessionsNote.te}`, en: `Quotation created ${result.quotationNumber}${sessionsNote.en}` }
      : { te: `కొటేషన్ మార్చారు ${result.quotationNumber} (వెర్షన్ ${result.version})${sessionsNote.te}`, en: `Quotation edited ${result.quotationNumber} (version ${result.version})${sessionsNote.en}` },
  });
  if (manual) await auditOverride(caller, "saveQuotation:manualTotal", c.QUOTATIONS, result.quotationId, autoTotal, fields.totalAmount, manual.reason);
  return { quotationId: result.quotationId, quotationNumber: result.quotationNumber, version: result.version };
});
