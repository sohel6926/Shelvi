/**
 * Module 2f (18 Nov 2026) — packed products.
 *  - savePackedProduct { id?, branchId?, …fields }: owner / manager. On create it also opens the linked stock item
 *    (counted in packs, expiry tracking on, starts at 0).
 *  - recordPacking { productId, packs, packedDay?, batchNo? }: adds the packs to stock with one batch number and
 *    expiry = packed day + shelf life. The stock movement carries expiryDay, so Module 2d opens the batch.
 * packedProducts and packedProducts/{id}/runs are written only here.
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertOpenDay } from "../ledger/lockGuard";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { todayIST } from "../shared/istDate";
import { batchNoFor, expiryFor, netText, parsePackRun, parsePackSale, parsePackedProduct, saleMoney, saleNumber, sellablePacks } from "./packRules";
import { loadSettings } from "../shared/settings";
import { reqString } from "../shared/validate";
import { ADMIN } from "../shared/callable";

const stockName = (nameEn: string, nameTe: string, netQty: number, netUnit: string) => `${nameEn || nameTe} ${netText(netQty, netUnit)}`.slice(0, 160);

export const savePackedProduct = callable("savePackedProduct", ADMIN_MANAGER, async (data, caller) => {
  const parsed = parsePackedProduct(data);
  if (!parsed.ok) fail("invalid-argument", parsed.te, parsed.en);
  const p = parsed.value;
  const db = getFirestore();
  const col = db.collection(FirestoreCollections.PACKED_PRODUCTS);
  const id = asStr(data.id);

  if (id) {
    const ref = col.doc(id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) fail("not-found", "ఆ ఉత్పత్తి దొరకలేదు.", "Packed product not found.");
      const cur = snap.data() as Doc;
      if (caller.role !== "admin" && caller.branchId !== asStr(cur.branchId)) fail("permission-denied", "ఈ branch ఉత్పత్తిని మార్చడానికి మీకు అనుమతి లేదు.", "You cannot change a product of another branch.");
      tx.update(ref, { ...p, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid });
      const itemId = asStr(cur.inventoryItemId);
      if (itemId) tx.update(db.collection(FirestoreCollections.INVENTORY).doc(itemId), { name: stockName(p.nameEn, p.nameTe, p.netQty, p.netUnit), lastUpdated: FieldValue.serverTimestamp(), updatedBy: caller.uid });
    });
    return { ok: true, id };
  }

  const branchId = caller.role === "admin" ? asStr(data.branchId) || caller.branchId : caller.branchId;
  if (!branchId) fail("invalid-argument", "ముందు branch ఎంచుకోండి.", "Choose a branch first.");
  const ref = col.doc();
  const itemRef = db.collection(FirestoreCollections.INVENTORY).doc();
  const batch = db.batch();
  batch.set(itemRef, {
    name: stockName(p.nameEn, p.nameTe, p.netQty, p.netUnit),
    unit: "pcs",
    category: "Packed",
    reorderLevel: 0,
    quantityInStock: 0,
    trackExpiry: true,
    packedProductId: ref.id,
    branchId,
    lastUpdated: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: caller.uid,
    updatedBy: caller.uid,
  });
  batch.set(ref, { ...p, branchId, inventoryItemId: itemRef.id, runCount: 0, lastPackedDay: "", createdAt: FieldValue.serverTimestamp(), createdBy: caller.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid });
  await batch.commit();
  return { ok: true, id: ref.id };
});

export const recordPacking = callable("recordPacking", ADMIN_MANAGER, async (data, caller) => {
  const productId = reqId(data, "productId");
  const parsed = parsePackRun(data, todayIST());
  if (!parsed.ok) fail("invalid-argument", parsed.te, parsed.en);
  const run = parsed.value;
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.PACKED_PRODUCTS).doc(productId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ ఉత్పత్తి దొరకలేదు.", "Packed product not found.");
    const prod = snap.data() as Doc;
    if (caller.role !== "admin" && caller.branchId !== asStr(prod.branchId)) fail("permission-denied", "ఈ branch ఉత్పత్తికి ప్యాకింగ్ నమోదు చేయడానికి మీకు అనుమతి లేదు.", "You cannot record packing for another branch.");
    if (prod.active === false) fail("failed-precondition", "ఈ ఉత్పత్తి ఆపివేయబడింది. ముందు దాన్ని ఆన్ చేయండి.", "This product is switched off. Turn it on first.");
    const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(asStr(prod.inventoryItemId) || "-");
    const item = await tx.get(itemRef);
    if (!item.exists) fail("failed-precondition", "ఈ ఉత్పత్తికి stock వస్తువు దొరకలేదు.", "The stock item of this product is missing.");

    const runNumber = asNum(prod.runCount, 0) + 1;
    const batchNo = run.batchNo || batchNoFor(run.packedDay, runNumber);
    const expiryDay = expiryFor(run.packedDay, asNum(prod.shelfLifeDays, 1));
    const newQty = asNum((item.data() as Doc).quantityInStock, 0) + run.packs;
    const moveRef = itemRef.collection(FirestoreCollections.MOVEMENTS).doc();

    tx.update(itemRef, { quantityInStock: newQty, lastUpdated: FieldValue.serverTimestamp(), updatedBy: caller.uid });
    tx.set(moveRef, { type: "IN", quantity: run.packs, reason: "packed", note: "", relatedBookingId: "", expiryDay, batchNo, packedDay: run.packedDay, packedProductId: productId, date: FieldValue.serverTimestamp(), recordedBy: caller.uid });
    tx.set(ref.collection("runs").doc(moveRef.id), {
      runNumber,
      packs: run.packs,
      packedDay: run.packedDay,
      expiryDay,
      batchNo,
      // what was printed on this batch, kept even if the product is changed later
      mrp: asNum(prod.mrp),
      netQty: asNum(prod.netQty),
      netUnit: asStr(prod.netUnit),
      by: caller.uid,
      byName: caller.name,
      at: FieldValue.serverTimestamp(),
    });
    tx.update(ref, { runCount: runNumber, lastPackedDay: run.packedDay, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, runId: moveRef.id, batchNo, expiryDay, packedDay: run.packedDay, packs: run.packs, newQuantity: newQty };
  });
});

/**
 * X5 — sellPacked { productId, packs, pricePerPack?, method?, customerName?, phone?, saleDay? } (owner / manager):
 * takes the packs out of stock (earliest expiry first, through Module 2d) and keeps the sale in packedSales.
 * Refused above MRP, and for more packs than are in stock and not expired.
 */
export const sellPacked = callable("sellPacked", ADMIN_MANAGER, async (data, caller) => {
  const productId = reqId(data, "productId");
  const db = getFirestore();
  const settings = await loadSettings();
  const today = todayIST();
  const ref = db.collection(FirestoreCollections.PACKED_PRODUCTS).doc(productId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ ఉత్పత్తి దొరకలేదు.", "Packed product not found.");
    const prod = snap.data() as Doc;
    if (caller.role !== "admin" && caller.branchId !== asStr(prod.branchId)) fail("permission-denied", "ఈ branch ఉత్పత్తిని అమ్మడానికి మీకు అనుమతి లేదు.", "You cannot sell a product of another branch.");
    const parsed = parsePackSale(data, asNum(prod.mrp), today);
    if (!parsed.ok) fail("invalid-argument", parsed.te, parsed.en);
    const sale = parsed.value;
    await assertOpenDay(sale.saleDay); // Module 4c: period lock
    const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(asStr(prod.inventoryItemId) || "-");
    const item = await tx.get(itemRef);
    if (!item.exists) fail("failed-precondition", "ఈ ఉత్పత్తికి stock వస్తువు దొరకలేదు.", "The stock item of this product is missing.");
    const stock = asNum((item.data() as Doc).quantityInStock);
    const can = sellablePacks(stock, asNum((item.data() as Doc).expiredQty));
    if (sale.packs > can) fail("failed-precondition", `అమ్మడానికి ${can} ప్యాక్‌లు మాత్రమే ఉన్నాయి (గడువు దాటినవి లెక్కలో లేవు).`, `Only ${can} packs can be sold (expired packs are not counted).`);
    const counterRef = db.collection(FirestoreCollections.COUNTERS).doc(`packedSale-${sale.saleDay}`);
    const n = asNum(((await tx.get(counterRef)).data() ?? {}).last) + 1;
    const money = saleMoney(sale.packs, sale.pricePerPack, asNum(prod.mrp), asNum(prod.gstRate), settings.gstRegistered);
    const saleRef = db.collection(FirestoreCollections.PACKED_SALES).doc();
    const number = saleNumber(sale.saleDay, n);

    tx.set(counterRef, { kind: "packedSale", day: sale.saleDay, last: n, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(itemRef, { quantityInStock: stock - sale.packs, lastUpdated: FieldValue.serverTimestamp(), updatedBy: caller.uid });
    tx.set(itemRef.collection(FirestoreCollections.MOVEMENTS).doc(saleRef.id), { type: "OUT", quantity: sale.packs, reason: "sold", note: number, relatedBookingId: "", packedProductId: productId, packedSaleId: saleRef.id, date: FieldValue.serverTimestamp(), recordedBy: caller.uid });
    tx.set(saleRef, {
      saleNumber: number,
      productId,
      productNameTe: asStr(prod.nameTe),
      productNameEn: asStr(prod.nameEn),
      netQty: asNum(prod.netQty),
      netUnit: asStr(prod.netUnit),
      hsn: asStr(prod.hsn),
      mrp: asNum(prod.mrp),
      ...sale,
      ...money,
      status: "Active",
      branchId: asStr(prod.branchId),
      inventoryItemId: itemRef.id,
      createdBy: caller.uid,
      createdByName: caller.name,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, saleId: saleRef.id, saleNumber: number, ...money, newQuantity: stock - sale.packs };
  });
});

/** X5 — cancelPackedSale { saleId, reason } (owner): the packs go back into stock, the sale is marked Cancelled (never deleted). */
export const cancelPackedSale = callable("cancelPackedSale", ADMIN, async (data, caller) => {
  const saleId = reqId(data, "saleId");
  const reason = reqString(data, "reason", 300).trim();
  if (reason.length < 3) fail("invalid-argument", "కారణం రాయండి (కనీసం 3 అక్షరాలు).", "A reason of at least 3 characters is required.");
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.PACKED_SALES).doc(saleId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ అమ్మకం దొరకలేదు.", "Sale not found.");
    const sale = snap.data() as Doc;
    await assertOpenDay(asStr(sale.saleDay)); // Module 4c: period lock
    if (asStr(sale.status) === "Cancelled") fail("failed-precondition", "ఈ అమ్మకం ఇప్పటికే రద్దు అయింది.", "This sale is already cancelled.");
    const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(asStr(sale.inventoryItemId) || "-");
    const item = await tx.get(itemRef);
    const packs = asNum(sale.packs);
    if (item.exists) {
      tx.update(itemRef, { quantityInStock: asNum((item.data() as Doc).quantityInStock) + packs, lastUpdated: FieldValue.serverTimestamp(), updatedBy: caller.uid });
      tx.set(itemRef.collection(FirestoreCollections.MOVEMENTS).doc(), { type: "IN", quantity: packs, reason: "sold-reversed", note: asStr(sale.saleNumber), relatedBookingId: "", packedSaleId: saleId, date: FieldValue.serverTimestamp(), recordedBy: caller.uid });
    }
    tx.update(ref, { status: "Cancelled", cancelReason: reason, cancelledBy: caller.uid, cancelledAt: FieldValue.serverTimestamp() });
    return { ok: true, returned: item.exists ? packs : 0 };
  });
});
