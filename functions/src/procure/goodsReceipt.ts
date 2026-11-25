/**
 * Module 3b (18 Nov 2026) — goods receipt against a purchase order.
 *  - receiveGoods { poId, receiveDay?, vendorBillNo?, note?, lines[{ line, delivered, accepted, rejectReason?, expiryDay?, batchNo? }] }:
 *    owner / manager. Accepted goods go into stock at once (line unit converted to the stock unit exactly like a
 *    purchase bill: shared pack sizes; a line that cannot be converted adds nothing and is flagged on the receipt).
 *    The order keeps the running accepted quantity per line and becomes partReceived / received.
 *  - closePurchaseOrder { id, reason }: owner / manager — the rest of a part-received order will not come.
 * goodsReceipts is written only here. The vendor's bill is matched against these receipts in Module 3c; a bill made
 * from an order must not add stock again.
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId, reqString } from "../shared/validate";
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { todayIST } from "../shared/istDate";
import { round2 } from "../calc/util";
import { normalizePacks } from "../shared/itemUnits";
import { purchaseStockLines } from "../stock/purchaseStockRules";
import { canReceivePo, docNumber, ProcureLine } from "./procureRules";
import { acceptedValue, canCloseShort, parseGoodsReceipt, poStatusAfter, receivedAfter } from "./grnRules";
import { loadSettings } from "../shared/settings";
import { branchStores } from "../stock/storeStock";
import { afterStoreChange, cleanStoreQty, homeStoreOf, receiveStoreProblem } from "../stock/storeRules";
import { effectiveRole, purchaseSodClash, sodMessage } from "../roles/permRules";

const stamp = () => FieldValue.serverTimestamp();

const poLines = (raw: unknown): ProcureLine[] =>
  asArr(raw).map((x) => {
    const l = asObj(x);
    return { description: asStr(l.description), inventoryItemId: asStr(l.inventoryItemId), groceryItemId: asStr(l.groceryItemId), qty: asNum(l.qty), unit: asStr(l.unit), rate: asNum(l.rate) };
  });

const RECEIVE_STORE: Record<string, { te: string; en: string }> = {
  "no-store": { te: "ఆ స్టోర్ దొరకలేదు.", en: "That store was not found." },
  "other-branch": { te: "సరుకు ఆర్డర్ శాఖలోని స్టోర్‌లోకే తీసుకోగలరు.", en: "Goods can be received only into a store of the order's branch." },
  "not-in-use": { te: "ఆ స్టోర్ ఇప్పుడు వాడుకలో లేదు.", en: "That store is not in use now." },
  blocked: { te: "వేరుగా ఉంచిన / వ్యర్థ స్టోర్‌లోకి సరుకు తీసుకోలేరు.", en: "Goods cannot be received into a quarantine or scrap store." },
};

export const receiveGoods = callable("receiveGoods", ADMIN_MANAGER, async (data, caller) => {
  const poId = reqId(data, "poId");
  const today = todayIST();
  const settings = await loadSettings();
  const db = getFirestore();
  const c = FirestoreCollections;
  const poRef = db.collection(c.PURCHASE_ORDERS).doc(poId);
  // Module 6a: the receipt may name the store the goods go into (else each item goes to its home store, as before)
  const storeId = asStr((data as Doc).storeId);
  const grnRef = db.collection(c.GOODS_RECEIPTS).doc();
  const counterRef = db.collection(c.COUNTERS).doc(`goodsReceipt-${today}`);

  return db.runTransaction(async (tx) => {
    // ---- reads
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) fail("not-found", "ఆ ఆర్డర్ దొరకలేదు.", "Purchase order not found.");
    const po = poSnap.data() as Doc;
    if (caller.role !== "admin" && caller.branchId !== asStr(po.branchId)) fail("permission-denied", "ఈ branch ఆర్డర్‌కి సరుకు తీసుకోవడానికి మీకు అనుమతి లేదు.", "You can't receive goods for an order of another branch.");
    if (!canReceivePo(asStr(po.status))) fail("failed-precondition", "ఆమోదం అయిన, ఇంకా పూర్తి కాని ఆర్డర్‌కే సరుకు తీసుకోగలరు.", "Goods can be received only against an approved order that is not complete.");
    // Module 4d: the person who asked for the goods does not also receive them (high-value orders)
    const sod = purchaseSodClash("receive", { uid: caller.uid, role: effectiveRole(caller.role, caller.jobRole) }, { requestedBy: asStr(po.sodRequestedBy) }, asNum(po.total), settings.sod);
    if (sod.clash) {
      const m = sodMessage(sod.clash);
      fail("permission-denied", m.te, m.en);
    }
    const stores = storeId ? await branchStores(db, asStr(po.branchId)) : [];
    if (storeId) {
      const p = receiveStoreProblem(stores.find((x) => x.id === storeId)?.data, asStr(po.branchId));
      if (p) fail("failed-precondition", RECEIVE_STORE[p].te, RECEIVE_STORE[p].en);
    }
    const lines = poLines(po.lines);
    const soFar = asArr(po.receivedQty).map((v) => asNum(v));
    const parsed = parseGoodsReceipt(data, lines, soFar, today);
    if (!parsed.ok) fail("invalid-argument", parsed.te, parsed.en);
    const grn = parsed.value;
    const n = asNum(((await tx.get(counterRef)).data() ?? {}).last) + 1;
    const itemIds = [...new Set(grn.lines.filter((l) => l.accepted > 0 && l.inventoryItemId).map((l) => l.inventoryItemId))];
    const invSnaps = itemIds.length ? await tx.getAll(...itemIds.map((id) => db.collection(c.INVENTORY).doc(id))) : [];
    const inv = new Map(invSnaps.filter((s) => s.exists).map((s) => [s.id, s]));
    const units = Object.fromEntries([...inv.values()].map((s) => [s.id, asStr((s.data() as Doc).unit)]));
    const packs = Object.fromEntries([...inv.values()].map((s) => [s.id, normalizePacks((s.data() as Doc).packs)]));

    // ---- work out the stock each line adds (in the stock item's own unit)
    const number = docNumber("GRN", today, n);
    const running = new Map<string, number>([...inv.values()].map((s) => [s.id, asNum((s.data() as Doc).quantityInStock)]));
    const skipped: { te: string; en: string }[] = [];
    const outLines = grn.lines.map((l) => {
      let stockQty = 0;
      let stockNote = "";
      if (l.accepted > 0 && l.inventoryItemId) {
        if (!inv.has(l.inventoryItemId)) stockNote = "item-missing";
        else {
          const r = purchaseStockLines({ items: [{ inventoryItemId: l.inventoryItemId, quantity: l.accepted, unit: l.unit, description: l.description }] }, units, packs);
          if (r.skipped.length) {
            stockNote = "unit-mismatch";
            skipped.push({ te: r.skipped[0].te, en: r.skipped[0].en });
          } else stockQty = r.wanted[l.inventoryItemId] ?? 0;
        }
      } else if (l.accepted > 0) {
        stockNote = "not-linked";
        skipped.push({ te: `${l.description}: స్టాక్ వస్తువుకు లింక్ లేదు — stock పెరగలేదు, చేతితో సరిచేయండి`, en: `${l.description}: not linked to a stock item — stock was not increased, adjust by hand` });
      }
      return { ...l, stockQty, stockUnit: l.inventoryItemId ? asStr(units[l.inventoryItemId]) : "", stockNote };
    });

    // ---- writes
    for (const l of outLines) {
      if (!(l.stockQty > 0)) continue;
      const s = inv.get(l.inventoryItemId);
      if (!s) continue;
      const next = round2((running.get(s.id) ?? 0) + l.stockQty);
      running.set(s.id, next);
      tx.set(s.ref.collection(c.MOVEMENTS).doc(), {
        type: "IN",
        quantity: l.stockQty,
        reason: "goods-receipt",
        note: number,
        goodsReceiptId: grnRef.id,
        purchaseOrderId: poId,
        // Module 2d: an expiry date on the receipt line opens a batch for a tracked item (stock/batches)
        ...(l.expiryDay ? { expiryDay: l.expiryDay, ...(l.batchNo ? { batchNo: l.batchNo } : {}) } : {}),
        ...(storeId ? { storeId } : {}),
        shortBy: 0,
        relatedBookingId: "",
        date: stamp(),
        recordedBy: caller.uid,
      });
    }
    for (const [id, qty] of running) {
      const s = inv.get(id);
      if (!s || qty === asNum((s.data() as Doc).quantityInStock)) continue;
      const patch: Doc = { quantityInStock: qty, lastUpdated: stamp(), updatedBy: caller.uid };
      if (storeId) {
        const item = s.data() as Doc;
        const home = homeStoreOf(item, stores);
        const added = round2(outLines.filter((l) => l.inventoryItemId === id).reduce((a, l) => a + l.stockQty, 0));
        patch.storeQty = afterStoreChange(cleanStoreQty(item.storeQty, home), home, storeId, added);
        patch.homeStoreId = home;
      }
      tx.update(s.ref, patch);
    }
    const received = receivedAfter(lines.length, soFar, grn.lines);
    const status = poStatusAfter(lines.map((l) => l.qty), received);
    const value = acceptedValue(grn.lines);
    const hasRejects = grn.lines.some((l) => l.rejected > 0);
    tx.set(counterRef, { kind: "goodsReceipt", day: today, last: n, updatedAt: stamp() }, { merge: true });
    tx.set(grnRef, {
      number, poId, poNumber: asStr(po.number), vendorId: asStr(po.vendorId), vendorName: asStr(po.vendorName), branchId: asStr(po.branchId),
      storeId, receiveDay: grn.receiveDay, vendorBillNo: grn.vendorBillNo, note: grn.note, lines: outLines, acceptedValue: value, hasRejects, stockSkipped: skipped.length > 0,
      billStatus: "unbilled", billId: "", sodOverride: sod.overridden, receivedBy: caller.uid, receivedByName: caller.name, createdAt: stamp(),
    });
    tx.update(poRef, { receivedByUids: FieldValue.arrayUnion(caller.uid), receivedQty: received, status, lastReceivedDay: grn.receiveDay, receiptCount: asNum(po.receiptCount) + 1, updatedAt: stamp(), updatedBy: caller.uid });
    if (hasRejects || skipped.length) {
      const te = [hasRejects ? `${number}: కొంత సరుకు తిప్పి పంపారు (${asStr(po.vendorName)})` : "", skipped.length ? `${number}: యూనిట్ వేరు — stock మార్చలేదు, చేతితో సరిచేయండి: ${skipped.map((x) => x.te).join("; ")}` : ""].filter(Boolean).join(" · ");
      const en = [hasRejects ? `${number}: some goods were sent back (${asStr(po.vendorName)})` : "", skipped.length ? `${number}: unit differs — stock not changed, adjust it by hand: ${skipped.map((x) => x.en).join("; ")}` : ""].filter(Boolean).join(" · ");
      tx.set(db.collection(c.NOTIFICATIONS).doc(`goodsReceipt_${grnRef.id}`), { kind: "goodsReceipt", audienceRoles: ["admin", "manager"], recipientUids: [], title: { te, en }, link: "/procurement", branchId: asStr(po.branchId), readBy: [], createdAt: stamp() });
    }
    return { ok: true, id: grnRef.id, number, status, acceptedValue: value, stockSkipped: skipped };
  });
});

export const closePurchaseOrder = callable("closePurchaseOrder", ADMIN_MANAGER, async (data, caller) => {
  const id = reqId(data, "id");
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.PURCHASE_ORDERS).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ ఆర్డర్ దొరకలేదు.", "Purchase order not found.");
    const cur = snap.data() as Doc;
    if (caller.role !== "admin" && caller.branchId !== asStr(cur.branchId)) fail("permission-denied", "ఈ branch ఆర్డర్‌ను ముగించడానికి మీకు అనుమతి లేదు.", "You can't close an order of another branch.");
    if (!canCloseShort(asStr(cur.status))) fail("failed-precondition", "కొంత సరుకు అందిన ఆర్డర్‌నే ఇలా ముగించగలరు.", "Only a part-received order can be closed this way.");
    tx.update(ref, { status: "received", closedShort: true, closeReason: reason, closedBy: caller.uid, closedAt: stamp(), updatedAt: stamp(), updatedBy: caller.uid });
    return { ok: true };
  });
});
