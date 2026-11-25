/**
 * Module 2i (18 Nov 2026) — standard, estimated and actual cost kept apart (see costRules).
 *  - setStandardCost { packageId, guests? } (owner): fixes the menu's standard plate cost from recipes × today's
 *    purchase rates + labour / overhead per plate. Kept on menuPackages/{id}.standardCost + standardCosts history.
 *  - estimateOnConfirm (trigger): when a booking becomes Confirmed, freezes its estimated cost once.
 *  - refreshCostEstimate { bookingId, reason } (owner): a new estimate version; older ones stay.
 *  - costComparison { bookingId } (owner): the three costs side by side.
 */
import { REGION } from "../setup";
import { getFirestore, FieldValue, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { callable, ADMIN } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId, reqString } from "../shared/validate";
import { asNum, asObj, asStr, Doc } from "../shared/coerce";
import { loadSettings } from "../shared/settings";
import { ingredientsForPackage, planForBooking } from "../kitchen/eventPlan";
import { loadGroceryRefs, purchaseRateRows, recentPurchases } from "../vendors/purchaseRates";
import { groceryRate } from "../vendors/rateRules";
import { actualTotal, costCompare, costFigure, needsEstimate, nextEstimateId, quotationCostKey, quotationParts, sumFigures } from "./costRules";

async function rateFor() {
  const [purchases, refs] = await Promise.all([recentPurchases(), loadGroceryRefs()]);
  const rows = purchaseRateRows(purchases, refs);
  return (groceryItemId: string) => groceryRate(rows, groceryItemId).rate?.rate ?? null;
}

export const setStandardCost = callable("setStandardCost", ADMIN, async (data, caller) => {
  const packageId = reqId(data, "packageId");
  const guests = data.guests === undefined || data.guests === null ? 100 : asNum(data.guests, NaN);
  if (!Number.isInteger(guests) || guests < 1 || guests > 20000) fail("invalid-argument", "అతిథుల సంఖ్య 1–20000 పూర్ణ సంఖ్య.", "guests must be a whole number 1–20000.");
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.MENU_PACKAGES).doc(packageId);
  const [snap, settings, plan, rate] = await Promise.all([ref.get(), loadSettings(), ingredientsForPackage(packageId, guests), rateFor()]);
  if (!snap.exists || !plan) fail("not-found", "ఆ menu దొరకలేదు.", "Menu package not found.");
  const fig = costFigure({ guests, lines: plan.ingredients.map((i) => ({ qty: i.gross, rate: rate(i.groceryItemId) })), labourPerPlate: settings.labourPerPlate, overheadPerPlate: settings.overheadPerPlate });
  if (!fig.complete) {
    fail(
      "failed-precondition",
      `ఖర్చు పూర్తిగా తెలియదు (${fig.coveragePct ?? 0}% సరుకులకే ధర ఉంది). ముందు రెసిపీలు, కొనుగోలు ధరలు నింపండి; తర్వాత ప్రామాణిక ఖర్చు నిర్ణయించండి.`,
      `The cost is not fully known (${fig.coveragePct ?? 0}% of ingredients have a rate). Fill in recipes and purchase rates first, then fix the standard cost.`,
    );
  }
  const standardCost = { perPlate: fig.perPlate, foodPerPlate: Math.round((fig.food / guests) * 100) / 100, labourPerPlate: settings.labourPerPlate, overheadPerPlate: settings.overheadPerPlate, guests, by: caller.uid, byName: caller.name };
  const batch = db.batch();
  batch.update(ref, { standardCost: { ...standardCost, at: FieldValue.serverTimestamp() } });
  batch.set(ref.collection("standardCosts").doc(), { ...standardCost, at: FieldValue.serverTimestamp(), previousPerPlate: asNum(asObj((snap.data() as Doc).standardCost).perPlate, 0) || null });
  await batch.commit();
  return { ok: true, packageId, ...standardCost };
});

/** Works the estimate out and stores it as a new version. Returns null when the booking does not exist. */
export async function snapshotEstimate(bookingId: string, by: { uid: string; name: string } | "auto", reason = ""): Promise<Doc | null> {
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.BOOKINGS).doc(bookingId);
  const first = await ref.get();
  if (!first.exists) return null;
  const booking = first.data() as Doc;
  const [settings, plan, rate] = await Promise.all([loadSettings(), planForBooking(bookingId, booking), rateFor()]);
  const guests = plan.plans.reduce((s, p) => s + Math.max(0, p.part.guests), 0);
  const fig = costFigure({ guests, lines: plan.ingredients.map((i) => ({ qty: i.gross, rate: rate(i.groceryItemId) })), labourPerPlate: settings.labourPerPlate, overheadPerPlate: settings.overheadPerPlate });
  const packageId = asStr(booking.packageId) || asStr(booking.menuPackageId);
  let standardPerPlate: number | null = null;
  if (packageId) {
    const pkg = await db.collection(FirestoreCollections.MENU_PACKAGES).doc(packageId).get();
    const sp = asNum(asObj((pkg.data() as Doc | undefined)?.standardCost).perPlate, 0);
    standardPerPlate = sp > 0 ? sp : null;
  }
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const cur = snap.data() as Doc;
    if (by === "auto" && cur.costEstimate) return null; // another run already froze it
    const { version, id } = nextEstimateId(asObj(cur.costEstimate).version);
    const est = { ...fig, version, standardPerPlate, packageId, by: by === "auto" ? "system" : by.uid, byName: by === "auto" ? "" : by.name, ...(reason ? { reason } : {}) };
    tx.set(ref.collection("costEstimates").doc(id), { ...est, at: FieldValue.serverTimestamp() });
    tx.update(ref, { costEstimate: { ...est, at: FieldValue.serverTimestamp() } });
    return est as Doc;
  });
}

export const estimateOnConfirm = onDocumentWritten(
  { document: "bookings/{bookingId}", region: REGION },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
    if (!needsEstimate(before, after)) return;
    try {
      await snapshotEstimate(event.params.bookingId, "auto");
    } catch (e) {
      logger.error("cost estimate failed", event.params.bookingId, e);
    }
  },
);

export const refreshCostEstimate = callable("refreshCostEstimate", ADMIN, async (data, caller) => {
  const bookingId = reqId(data, "bookingId");
  const reason = reqString(data, "reason", 300).trim();
  if (reason.length < 3) fail("invalid-argument", "కారణం రాయండి (కనీసం 3 అక్షరాలు).", "A reason of at least 3 characters is required.");
  const est = await snapshotEstimate(bookingId, { uid: caller.uid, name: caller.name }, reason);
  if (!est) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  return { ok: true, estimate: est };
});

export const costComparison = callable("costComparison", ADMIN, async (data) => {
  const bookingId = reqId(data, "bookingId");
  const snap = await getFirestore().collection(FirestoreCollections.BOOKINGS).doc(bookingId).get();
  if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  const b = snap.data() as Doc;
  const est = b.costEstimate ? asObj(b.costEstimate) : null;
  const guests = est ? asNum(est.guests) : asNum(b.guestCountActual) || asNum(b.guestCountConfirmed) || asNum(b.guestCount);
  const cmp = costCompare({ guests, standardPerPlate: est && asNum(est.standardPerPlate) > 0 ? asNum(est.standardPerPlate) : null, estimatedTotal: est ? asNum(est.total) : null, actualTotal: actualTotal(b.costActual) });
  return {
    bookingId,
    ...cmp,
    estimate: est ? { version: asNum(est.version), food: asNum(est.food), labour: asNum(est.labour), overhead: asNum(est.overhead), coveragePct: typeof est.coveragePct === "number" ? est.coveragePct : null, complete: est.complete === true, reason: asStr(est.reason) } : null,
    actualParts: b.costActual ? { food: asNum(asObj(b.costActual).food), labour: asNum(asObj(b.costActual).labour), transport: asNum(asObj(b.costActual).transport), rentals: asNum(asObj(b.costActual).rentals), other: asNum(asObj(b.costActual).other) } : null,
  };
});

/**
 * X9: every quotation carries the estimated cost of what it offers (🔒 quotations/{id}.costEstimate), worked out when
 * the quotation is saved and again only when its menus or plates change. Margin = quoted amount before tax − cost.
 */
export const estimateOnQuotation = onDocumentWritten(
  { document: "quotations/{quotationId}", region: REGION },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>) => {
    const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
    if (!after || !event.data?.after) return;
    const key = quotationCostKey(after);
    if (key === "[]" || asStr(asObj(after.costEstimate).key) === key) return;
    try {
      const [settings, rate] = await Promise.all([loadSettings(), rateFor()]);
      const figs = [];
      for (const part of quotationParts(after)) {
        const plan = await ingredientsForPackage(part.packageId, part.plates);
        if (!plan) continue;
        figs.push(costFigure({ guests: part.plates, lines: plan.ingredients.map((i) => ({ qty: i.gross, rate: rate(i.groceryItemId) })), labourPerPlate: settings.labourPerPlate, overheadPerPlate: settings.overheadPerPlate }));
      }
      const fig = sumFigures(figs);
      const taxable = asNum(after.taxable) || asNum(after.subtotal);
      const marginPct = fig.complete && taxable > 0 ? Math.round(((taxable - fig.total) / taxable) * 1000) / 10 : null;
      await event.data.after.ref.update({ costEstimate: { ...fig, key, marginPct, at: FieldValue.serverTimestamp() } });
    } catch (e) {
      logger.error("quotation cost estimate failed", event.params.quotationId, e);
    }
  },
);
