/**
 * Module 3c (19 Nov 2026) — the vendor's bill for a purchase order, matched three ways (order × goods received × bill).
 *  - saveVendorBill { poId, billNo, billDay?, lines[{ line, qty, rate }], otherCharges?, discount?, note? }: owner /
 *    manager. Writes a normal purchases document (so vendor dues and payments work as before) that carries
 *    purchaseOrderId, the match result and paymentHold. Its lines have no inventoryItemId — the goods already went
 *    into stock on the receipt, so the purchase stock trigger adds nothing.
 *  - releaseBillHold { purchaseId, reason }: owner only — pay a mismatched bill anyway.
 *  - cancelGoodsReceipt { id, reason }: owner / manager — takes a wrong receipt back (stock out again) while its
 *    goods are not billed.
 *  - poBillRollup (trigger on purchases): keeps billedQty / billedAmount / billCount / heldCount on the order from
 *    its live bills, so cancelling a bill corrects the order by itself.
 * recordVendorPayment refuses a bill with paymentHold.
 */
import { REGION } from "../setup";
import { assertOpenDay } from "../ledger/lockGuard";
import { getFirestore, FieldValue, Timestamp, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { callable, ADMIN, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId, reqString } from "../shared/validate";
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { istNoon, todayIST } from "../shared/istDate";
import { round2 } from "../calc/util";
import { isLiveRecord } from "../shared/costTarget";
import { loadSettings } from "../shared/settings";
import { ProcureLine } from "./procureRules";
import { poStatusAfter } from "./grnRules";
import { billedSoFar, canCancelReceipt, matchBill, parseVendorBill } from "./matchRules";
import { effectiveRole, purchaseSodClash, sodMessage } from "../roles/permRules";
import { afterStoreChange, cleanStoreQty } from "../stock/storeRules";

const stamp = () => FieldValue.serverTimestamp();
const BILLABLE = ["approved", "partReceived", "received"];

const poLinesOf = (raw: unknown): ProcureLine[] =>
  asArr(raw).map((x) => {
    const l = asObj(x);
    return { description: asStr(l.description), inventoryItemId: asStr(l.inventoryItemId), groceryItemId: asStr(l.groceryItemId), qty: asNum(l.qty), unit: asStr(l.unit), rate: asNum(l.rate) };
  });

export const saveVendorBill = callable("saveVendorBill", ADMIN_MANAGER, async (data, caller) => {
  const poId = reqId(data, "poId");
  const today = todayIST();
  const settings = await loadSettings();
  await assertOpenDay(asStr(data.billDay) || today); // Module 4c: period lock
  const db = getFirestore();
  const c = FirestoreCollections;
  const poRef = db.collection(c.PURCHASE_ORDERS).doc(poId);
  const billRef = db.collection(c.PURCHASES).doc();

  return db.runTransaction(async (tx) => {
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) fail("not-found", "ఆ ఆర్డర్ దొరకలేదు.", "Purchase order not found.");
    const po = poSnap.data() as Doc;
    if (caller.role !== "admin" && caller.branchId !== asStr(po.branchId)) fail("permission-denied", "ఈ branch ఆర్డర్‌కి బిల్ రాయడానికి మీకు అనుమతి లేదు.", "You can't enter a bill for an order of another branch.");
    if (!BILLABLE.includes(asStr(po.status))) fail("failed-precondition", "ఆమోదం అయిన ఆర్డర్‌కే బిల్ రాయగలరు.", "A bill can be entered only for an approved order.");
    // Module 4d: the bill is entered by someone who neither asked for the goods nor received them (high-value orders)
    const actors = { requestedBy: asStr(po.sodRequestedBy), receivedBy: asArr(po.receivedByUids).map((v) => asStr(v)).filter(Boolean) };
    const sod = purchaseSodClash("verifyBill", { uid: caller.uid, role: effectiveRole(caller.role, caller.jobRole) }, actors, asNum(po.total), settings.sod);
    if (sod.clash) {
      const m = sodMessage(sod.clash);
      fail("permission-denied", m.te, m.en);
    }
    const lines = poLinesOf(po.lines);
    const parsed = parseVendorBill(data, lines, today);
    if (!parsed.ok) fail("invalid-argument", parsed.te, parsed.en);
    const bill = parsed.value;
    const earlier = (await tx.get(db.collection(c.PURCHASES).where("purchaseOrderId", "==", poId))).docs.map((d) => d.data() as Doc).filter(isLiveRecord);
    if (earlier.some((b) => asStr(b.billNumber).toLowerCase() === bill.billNo.toLowerCase())) fail("already-exists", `బిల్ ${bill.billNo} ఈ ఆర్డర్‌కి ఇప్పటికే రాశారు.`, `Bill ${bill.billNo} is already entered for this order.`);
    const accepted = asArr(po.receivedQty).map((v) => asNum(v));
    const match = matchBill(bill, accepted, billedSoFar(lines.length, earlier), settings.billMatch);
    const hold = match.status === "mismatch";

    tx.set(billRef, {
      vendorId: asStr(po.vendorId),
      vendorNameSnapshot: asStr(po.vendorName),
      billNumber: bill.billNo,
      purchaseDate: Timestamp.fromDate(istNoon(bill.billDay)),
      items: bill.lines.map((l) => ({ description: l.description, category: "", module: "", quantity: l.qty, unit: l.unit, unitPrice: l.rate, amount: l.amount })),
      subtotal: bill.subtotal,
      discount: bill.discount,
      otherCharges: bill.otherCharges,
      totalAmount: bill.total,
      paymentMethod: "Credit",
      notes: bill.note,
      costTarget: { type: "overhead", centre: "general" },
      bookingId: "",
      sessionId: "",
      purchaseNumber: `PUR-${today.slice(0, 4)}-${String(Date.now()).slice(-6)}`,
      billPhotoUrl: "",
      staffUid: caller.uid,
      staffName: caller.name,
      isDeleted: false,
      branchId: asStr(po.branchId),
      // Module 3c — server-only
      purchaseOrderId: poId,
      purchaseOrderNumber: asStr(po.number),
      poLines: bill.lines.map((l) => ({ line: l.line, qty: l.qty, rate: l.rate })),
      match: { status: match.status, issues: match.issues, supported: match.supported, extra: match.extra },
      paymentHold: hold,
      sodActors: { ...actors, billVerifiedBy: caller.uid },
      sodAmount: asNum(po.total),
      sodOverride: sod.overridden,
      holdReleasedBy: "",
      holdReleaseReason: "",
      createdBy: caller.uid,
      createdAt: stamp(),
      updatedBy: caller.uid,
      updatedAt: stamp(),
    });
    if (hold) {
      tx.set(db.collection(c.NOTIFICATIONS).doc(`billMismatch_${billRef.id}`), {
        kind: "billMismatch",
        audienceRoles: ["admin"],
        recipientUids: [],
        title: {
          te: `బిల్ ${bill.billNo} (${asStr(po.vendorName)}) ఆర్డర్ ${asStr(po.number)} తో సరిపోలలేదు — చెల్లింపు ఆపాం: ${match.issues.map((x) => x.te).join("; ")}`.slice(0, 900),
          en: `Bill ${bill.billNo} (${asStr(po.vendorName)}) does not match order ${asStr(po.number)} — payment is on hold: ${match.issues.map((x) => x.en).join("; ")}`.slice(0, 900),
        },
        link: "/procurement",
        branchId: asStr(po.branchId),
        readBy: [],
        createdAt: stamp(),
      });
    }
    return { ok: true, id: billRef.id, total: bill.total, matchStatus: match.status, issues: match.issues.map((x) => ({ te: x.te, en: x.en })), paymentHold: hold };
  });
});

export const releaseBillHold = callable("releaseBillHold", ADMIN, async (data, caller) => {
  const purchaseId = reqId(data, "purchaseId");
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.PURCHASES).doc(purchaseId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ బిల్ దొరకలేదు.", "Bill not found.");
    const cur = snap.data() as Doc;
    if (cur.paymentHold !== true) fail("failed-precondition", "ఈ బిల్ చెల్లింపు ఆపి లేదు.", "This bill is not on hold.");
    tx.update(ref, { paymentHold: false, holdReleasedBy: caller.uid, holdReleasedByName: caller.name, holdReleaseReason: reason, holdReleasedAt: stamp(), updatedBy: caller.uid, updatedAt: stamp() });
    return { ok: true };
  });
});

export const cancelGoodsReceipt = callable("cancelGoodsReceipt", ADMIN_MANAGER, async (data, caller) => {
  const id = reqId(data, "id");
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const c = FirestoreCollections;
  const grnRef = db.collection(c.GOODS_RECEIPTS).doc(id);
  return db.runTransaction(async (tx) => {
    const grnSnap = await tx.get(grnRef);
    if (!grnSnap.exists) fail("not-found", "ఆ రసీదు దొరకలేదు.", "Goods receipt not found.");
    const grn = grnSnap.data() as Doc;
    if (caller.role !== "admin" && caller.branchId !== asStr(grn.branchId)) fail("permission-denied", "ఈ branch రసీదును రద్దు చేయడానికి మీకు అనుమతి లేదు.", "You can't cancel a receipt of another branch.");
    const poRef = db.collection(c.PURCHASE_ORDERS).doc(asStr(grn.poId) || "-");
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) fail("failed-precondition", "ఈ రసీదు ఆర్డర్ దొరకలేదు.", "The order of this receipt is missing.");
    const po = poSnap.data() as Doc;
    const lines = asArr(grn.lines).map(asObj).map((l) => ({ line: asNum(l.line, -1), accepted: asNum(l.accepted), inventoryItemId: asStr(l.inventoryItemId), stockQty: asNum(l.stockQty) }));
    const received = asArr(po.receivedQty).map((v) => asNum(v));
    const bills = (await tx.get(db.collection(c.PURCHASES).where("purchaseOrderId", "==", asStr(grn.poId)))).docs.map((d) => d.data() as Doc).filter(isLiveRecord);
    const ordered = asArr(po.lines).map((l) => asNum(asObj(l).qty));
    if (!canCancelReceipt({ cancelled: grn.cancelled === true, lines }, received, billedSoFar(ordered.length, bills))) {
      fail("failed-precondition", "ఈ రసీదు సరుకుకి బిల్ రాశారు (లేదా ఇది ఇప్పటికే రద్దు అయింది). ముందు బిల్ రద్దు చేయండి.", "The goods of this receipt are billed (or it is already cancelled). Cancel the bill first.");
    }
    const itemIds = [...new Set(lines.filter((l) => l.stockQty > 0 && l.inventoryItemId).map((l) => l.inventoryItemId))];
    const invSnaps = itemIds.length ? await tx.getAll(...itemIds.map((x) => db.collection(c.INVENTORY).doc(x))) : [];

    for (const s of invSnaps) {
      if (!s.exists) continue;
      const want = round2(lines.filter((l) => l.inventoryItemId === s.id).reduce((a, l) => a + l.stockQty, 0));
      const stock = asNum((s.data() as Doc).quantityInStock);
      const move = Math.min(want, Math.max(0, stock));
      if (move > 0) {
        tx.set(s.ref.collection(c.MOVEMENTS).doc(), { type: "OUT", quantity: move, reason: "goods-receipt-reversed", ...(asStr(grn.storeId) ? { storeId: asStr(grn.storeId) } : {}), note: asStr(grn.number), goodsReceiptId: id, purchaseOrderId: asStr(grn.poId), shortBy: round2(want - move), relatedBookingId: "", date: stamp(), recordedBy: caller.uid });
        const patch: Doc = { quantityInStock: round2(stock - move), lastUpdated: stamp(), updatedBy: caller.uid };
        const grnStore = asStr(grn.storeId);
        if (grnStore) {
          // Module 6a: the goods went into a named store — take them out of that store (the home store is what is left)
          const item = s.data() as Doc;
          const home = asStr(item.homeStoreId);
          patch.storeQty = afterStoreChange(cleanStoreQty(item.storeQty, home), home, grnStore, -move);
        }
        tx.update(s.ref, patch);
      }
    }
    const next = received.map((q, i) => Math.round(Math.max(0, q - lines.filter((l) => l.line === i).reduce((a, l) => a + l.accepted, 0)) * 1000) / 1000);
    while (next.length < ordered.length) next.push(0);
    tx.update(poRef, { receivedQty: next, status: poStatusAfter(ordered, next), closedShort: false, updatedAt: stamp(), updatedBy: caller.uid });
    tx.update(grnRef, { cancelled: true, cancelReason: reason, cancelledBy: caller.uid, cancelledByName: caller.name, cancelledAt: stamp() });
    return { ok: true };
  });
});

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

/** Keeps the order's bill totals right whatever happens to its bills (entered, cancelled, hold released). */
export const poBillRollup = onDocumentWritten({ document: "purchases/{id}", region: REGION }, async (event: WriteEvent) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
  const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
  const poId = asStr(after?.purchaseOrderId) || asStr(before?.purchaseOrderId);
  if (!poId) return;
  const db = getFirestore();
  const poRef = db.collection(FirestoreCollections.PURCHASE_ORDERS).doc(poId);
  await db.runTransaction(async (tx) => {
    const po = await tx.get(poRef);
    if (!po.exists) return;
    const bills = (await tx.get(db.collection(FirestoreCollections.PURCHASES).where("purchaseOrderId", "==", poId))).docs.map((d) => d.data() as Doc).filter(isLiveRecord);
    const count = asArr((po.data() as Doc).lines).length;
    const next = { billedQty: billedSoFar(count, bills), billedAmount: round2(bills.reduce((a, b) => a + asNum(b.totalAmount), 0)), billCount: bills.length, heldCount: bills.filter((b) => b.paymentHold === true).length };
    const cur = po.data() as Doc;
    if (JSON.stringify([cur.billedQty ?? null, cur.billedAmount ?? null, cur.billCount ?? null, cur.heldCount ?? null]) === JSON.stringify([next.billedQty, next.billedAmount, next.billCount, next.heldCount])) return;
    tx.update(poRef, next);
  });
});
