/**
 * R10-12 lunch boxes (sales from Jan 2027):
 *   saveLunchBoxOrder { id?, customerId, date? | days[] + startDate (+ endDate?), count, menuOptionIds[], deliveryAddress,
 *                       deliveryTime, pricePerBox?, status? } (A/M)
 *   markLunchBoxDelivered { orderId, date, count? } (A/M/S) — the delivery tick (count defaults to the planned boxes; 0 = not delivered)
 *   invoiceLunchBoxes { customerId, month } (A/M) — one invoice per customer and month for the boxes delivered (§22)
 * dayPlan includes active orders of the day as "events" (kitchen/eventPlan.ts).
 */
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optId, optString, reqArray, reqDay, reqId, reqMonth, reqNum } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { isValidDay, istNoon, monthRange, todayIST } from "../shared/istDate";
import { effectiveGstRate, invoiceDocTitle, issuerLine, loadSettings } from "../shared/settings";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { reserveNumber } from "../shared/counters";
import { buildUpiPayload } from "../integrations/upi";
import { NO_BRANCH_ERROR, resolveBranchId } from "../shared/branch";
import { formatRupees } from "../shared/templates";
import { invoiceTotals } from "../calc/gst";
import { lunchBoxesOn, lunchBoxMonthLines, WEEKDAYS } from "../calc/round10";
import { round2 } from "../calc/util";
import { deliveriesOf, readLunchBoxOrder } from "./lunchBoxRules";

const STATUSES = ["active", "paused", "cancelled"] as const;

export const saveLunchBoxOrder = callable("saveLunchBoxOrder", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const id = optId(data, "id");
  const customerId = reqId(data, "customerId");
  const count = reqNum(data, "count", { min: 1, max: 10000 });
  if (!Number.isInteger(count)) fail("invalid-argument", "బాక్సుల సంఖ్య పూర్ణ సంఖ్య.", "count must be a whole number.");
  const date = asStr(data.date);
  const days = Array.isArray(data.days) ? data.days.map((x) => String(x).toLowerCase().slice(0, 3)) : [];
  if (date && !isValidDay(date)) fail("invalid-argument", "తేదీ YYYY-MM-DD.", "date must be YYYY-MM-DD.");
  if (!date && !days.length) fail("invalid-argument", "ఒక తేదీ గానీ, వారంలో రోజులు (సోమ–శని) గానీ ఇవ్వండి.", "Give a date or the weekdays (mon–sat).");
  if (days.some((d) => !(WEEKDAYS as readonly string[]).includes(d) || d === "sun")) fail("invalid-argument", "రోజులు సోమ నుండి శని వరకు మాత్రమే.", "days must be mon–sat.");
  const startDate = asStr(data.startDate) || todayIST();
  const endDate = asStr(data.endDate);
  if (!isValidDay(startDate) || (endDate && (!isValidDay(endDate) || endDate < startDate))) fail("invalid-argument", "మొదలు / ముగింపు తేదీలు సరిగా లేవు.", "startDate / endDate are not valid.");
  const menuOptionIds = reqArray(data, "menuOptionIds", 30).map(String).filter(Boolean);
  const settings = await loadSettings();
  const pricePerBox = data.pricePerBox === undefined || data.pricePerBox === null ? settings.lunchBoxPrice : reqNum(data, "pricePerBox", { min: 0, max: 100000 });
  const status = data.status === undefined ? "active" : String(data.status);
  if (!(STATUSES as readonly string[]).includes(status)) fail("invalid-argument", "status: active / paused / cancelled.", "status must be active, paused or cancelled.");
  const cSnap = await db.collection(c.CUSTOMERS).doc(customerId).get();
  if (!cSnap.exists) fail("not-found", "కస్టమర్ దొరకలేదు.", "Customer not found.");
  const cust = cSnap.data() as Doc;
  const branchId = resolveBranchId(optString(data, "branchId", 200), caller.branchId);
  if (!branchId) fail("invalid-argument", NO_BRANCH_ERROR.te, NO_BRANCH_ERROR.en);
  assertAdminOrOwnBranch(caller, branchId);
  const fields = {
    customerId,
    customerNameSnapshot: asStr(cust.name),
    ...(date ? { date, days: [] } : { date: "", days, startDate, endDate }),
    count,
    menuOptionIds,
    deliveryAddress: (optString(data, "deliveryAddress", 1000) ?? asStr(cust.address)).trim(),
    deliveryTime: (optString(data, "deliveryTime", 5) ?? "12:30").trim(),
    pricePerBox,
    status,
    branchId,
    updatedBy: caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = id ? db.collection(c.LUNCH_BOX_ORDERS).doc(id) : db.collection(c.LUNCH_BOX_ORDERS).doc();
  if (id) {
    const ex = await ref.get();
    if (!ex.exists) fail("not-found", "ఆ order దొరకలేదు.", "Order not found.");
    assertAdminOrOwnBranch(caller, asStr((ex.data() as Doc).branchId));
    await ref.update(fields);
  } else await ref.set({ ...fields, deliveries: {}, createdBy: caller.uid, createdAt: FieldValue.serverTimestamp() });
  return { id: ref.id, pricePerBox };
});

export const markLunchBoxDelivered = callable("markLunchBoxDelivered", ALL_ROLES, async (data, caller) => {
  const db = getFirestore();
  const orderId = reqId(data, "orderId");
  const date = reqDay(data, "date");
  if (date > todayIST()) fail("invalid-argument", "ముందు రోజుల delivery tick చేయలేము.", "A future delivery cannot be ticked.");
  const ref = db.collection(FirestoreCollections.LUNCH_BOX_ORDERS).doc(orderId);
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ order దొరకలేదు.", "Order not found.");
    const o = snap.data() as Doc;
    if (caller.role === "staff") {
      if (caller.branchId && asStr(o.branchId) && caller.branchId !== asStr(o.branchId)) fail("permission-denied", "మీ branch order కాదు.", "Not your branch's order.");
    } else assertAdminOrOwnBranch(caller, asStr(o.branchId));
    const planned = lunchBoxesOn(readLunchBoxOrder(snap.id, o, 0), date);
    const count = data.count === undefined || data.count === null ? planned : reqNum(data, "count", { min: 0, max: 10000 });
    if (!Number.isInteger(count)) fail("invalid-argument", "బాక్సుల సంఖ్య పూర్ణ సంఖ్య.", "count must be a whole number.");
    tx.update(ref, { [`deliveries.${date}`]: count, [`deliveredBy.${date}`]: { uid: caller.uid, name: caller.name, at: Timestamp.now() }, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
    return { planned, count };
  });
  return { ok: true, ...res };
});

export const invoiceLunchBoxes = callable("invoiceLunchBoxes", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const customerId = reqId(data, "customerId");
  const month = reqMonth(data, "month");
  const settings = await loadSettings();
  const [cSnap, orderSnap] = await Promise.all([db.collection(c.CUSTOMERS).doc(customerId).get(), db.collection(c.LUNCH_BOX_ORDERS).where("customerId", "==", customerId).get()]);
  if (!cSnap.exists) fail("not-found", "కస్టమర్ దొరకలేదు.", "Customer not found.");
  const cust = cSnap.data() as Doc;
  const orders = orderSnap.docs.map((d) => ({ id: d.id, d: d.data() as Doc }));
  if (!orders.length) fail("failed-precondition", "ఈ కస్టమర్‌కి lunch box orders లేవు.", "This customer has no lunch box orders.");
  const branchId = asStr(orders[0].d.branchId);
  assertAdminOrOwnBranch(caller, branchId);
  const parsed = orders.map((o) => readLunchBoxOrder(o.id, o.d, settings.lunchBoxPrice));
  const deliveries = Object.fromEntries(orders.map((o) => [o.id, deliveriesOf(o.d)]));
  const lines = lunchBoxMonthLines(parsed, deliveries, month);
  if (!lines.length) fail("failed-precondition", `${month} లో delivery tick అయిన boxes లేవు.`, `No delivered boxes ticked in ${month}.`);
  const lineItems = lines.map((l) => ({ key: `lunchBox:${l.orderId}`, description: `Lunch boxes ${month} (${l.days} days)`, descriptionTe: `లంచ్ బాక్సులు ${month} (${l.days} రోజులు)`, quantity: l.boxes, unitPrice: l.rate, amount: l.amount }));
  const subtotal = round2(lineItems.reduce((a, l) => a + l.amount, 0));
  const gstRate = effectiveGstRate(settings);
  const t = invoiceTotals(subtotal, gstRate, false, 0);
  const today = todayIST();
  const ref = db.collection(c.INVOICES).doc(`lunchbox_${customerId}_${month}`);
  const res = await db.runTransaction(async (tx) => {
    const ex = await tx.get(ref);
    const old = ex.data() as Doc | undefined;
    if (old && asNum(old.amountPaid) > 0) fail("failed-precondition", "ఈ నెల lunch box bill కి డబ్బు వచ్చింది — మళ్ళీ చేయలేము.", "This month's lunch box invoice already has payments.");
    if (old && asStr(old.status) === "Cancelled") fail("failed-precondition", "ఈ నెల bill రద్దు అయింది.", "This month's invoice was cancelled.");
    const invoiceNumber = old ? asStr(old.invoiceNumber) : await reserveNumber(tx, "invoice", Number(today.slice(0, 4)));
    const fields = {
      kind: "lunchBox",
      lunchBoxMonth: month,
      lineItems,
      subtotal,
      discount: 0,
      taxable: t.taxable,
      gstRate,
      isInterState: false,
      cgstAmount: t.cgst,
      sgstAmount: t.sgst,
      igstAmount: t.igst,
      taxAmount: t.tax,
      totalAmount: t.total,
      bookingId: "",
      customerId,
      customerNameSnapshot: asStr(cust.name),
      invoiceNumber,
      docTitle: invoiceDocTitle(settings),
      issuerLine: issuerLine(settings),
      terms: settings.invoiceTerms,
      gstin: settings.gstRegistered ? settings.gstin : "",
      issueDate: Timestamp.fromDate(istNoon(today)),
      dueDate: Timestamp.fromDate(monthRange(month).end),
      amountPaid: 0,
      balanceDue: t.total,
      status: t.total === 0 ? "Paid" : "Draft",
      upiQrPayload: buildUpiPayload({ upiId: settings.upiId, payeeName: settings.name, amount: t.total, note: invoiceNumber }),
      calcMode: "auto",
      updatedBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (old) tx.update(ref, fields);
    else tx.set(ref, { ...fields, branchId, createdBy: caller.uid, createdAt: FieldValue.serverTimestamp() });
    return { invoiceNumber };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "invoiceLunchBoxes", collection: c.INVOICES, docId: ref.id, after: { month, totalAmount: t.total, boxes: lines.reduce((a, l) => a + l.boxes, 0) } });
  return { invoiceId: ref.id, invoiceNumber: res.invoiceNumber, lines, totalAmount: t.total, text: { te: `${month} లంచ్ బాక్సుల bill: ${formatRupees(t.total)}`, en: `Lunch boxes ${month}: ${formatRupees(t.total)}` } };
});
