/**
 * Event stock deduction (api-contract Round 6 A): when an event is Completed, take its §6 grocery quantities out
 * of stock (OUT movements, same shape as adjustStock), never below 0. Idempotent: one transaction checks
 * bookings/{id}.stockDeduction first, so it never deducts twice.
 */
import { REGION } from "../setup";
import { getFirestore, FieldValue, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { callable, ADMIN, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { checkNum, optArray, reqId, reqString } from "../shared/validate";
import { asNum, asObj, asStr, Doc } from "../shared/coerce";
import { loadSettings } from "../shared/settings";
import { assertAdminOrOwnBranch, CallerContext } from "../auth/authContext";
import { assertCanOverride, auditOverride } from "../shared/override";
import { MIN_REASON_LENGTH } from "../shared/overridePolicy";
import { writeAuditEntry } from "../shared/auditLog";
import { EVENT_FACTORS, EventType } from "../calc/cooking";
import { eventStockLines, GroceryForStock } from "../calc/stock";
import { round2 } from "../calc/util";
import { bookingGuests } from "../kitchen/cookLearning";
import { splitGroceryMaster } from "../kitchen/groceryMaster";
import { shouldAutoDeduct } from "./stockRules";
import { bookingGuestList } from "../events/sessions";

export { shouldAutoDeduct };

type By = "auto" | { uid: string; name: string };

/** Same §6 lines as groceryList: only grocery master items with per100 > 0 and a valid unit. */
async function loadGroceries(): Promise<{ groceries: GroceryForStock[]; skippedNoPer100: number }> {
  const snap = await getFirestore().collection(FirestoreCollections.GROCERY_ITEMS).get();
  const { usable, skippedNoPer100, skippedBadUnit } = splitGroceryMaster(snap.docs.map((d) => ({ id: d.id, data: d.data() as Doc })));
  return { groceries: usable, skippedNoPer100: skippedNoPer100 + skippedBadUnit };
}

/** Runs the deduction in one transaction. Returns null when a live deduction already exists. */
export async function applyStockForBooking(bookingId: string, by: By, manual?: Record<string, number>, reason = ""): Promise<Doc | null> {
  const db = getFirestore();
  const c = FirestoreCollections;
  const { groceries, skippedNoPer100 } = await loadGroceries();
  const invIds = [...new Set(groceries.map((g) => g.inventoryItemId).filter(Boolean))];
  const bookingRef = db.collection(c.BOOKINGS).doc(bookingId);
  return db.runTransaction(async (tx) => {
    const bSnap = await tx.get(bookingRef);
    if (!bSnap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
    const booking = bSnap.data() as Doc;
    const existing = asObj(booking.stockDeduction);
    if (booking.stockDeduction && existing.reversed !== true) return null;
    const guests = bookingGuestList(booking, bookingGuests(booking));
    if (!guests.length) fail("failed-precondition", "Booking లో అతిథుల సంఖ్య లేదు.", "Booking has no guest count.");
    const evt = asStr(booking.eventTypeCode, "other");
    const eventType: EventType = evt in EVENT_FACTORS ? (evt as EventType) : "other";
    const invSnaps = invIds.length ? await tx.getAll(...invIds.map((id) => db.collection(c.INVENTORY).doc(id))) : [];
    const stock: Record<string, number> = {};
    invSnaps.forEach((s) => {
      if (s.exists) stock[s.id] = asNum((s.data() as Doc).quantityInStock);
    });
    const { items, skipped } = eventStockLines(groceries, eventType, guests, stock, manual ?? {});
    const totals = new Map<string, number>();
    for (const it of items) totals.set(it.inventoryItemId, round2((totals.get(it.inventoryItemId) ?? 0) + it.deducted));
    const recordedBy = by === "auto" ? "system" : by.uid;
    for (const it of items) {
      if (it.deducted <= 0) continue;
      tx.set(db.collection(c.INVENTORY).doc(it.inventoryItemId).collection(c.MOVEMENTS).doc(), {
        type: "OUT",
        quantity: it.deducted,
        reason: "event",
        relatedBookingId: bookingId,
        bookingId,
        groceryItemId: it.groceryItemId,
        date: FieldValue.serverTimestamp(),
        recordedBy,
      });
    }
    for (const [invId, total] of totals) {
      if (total <= 0) continue;
      tx.update(db.collection(c.INVENTORY).doc(invId), { quantityInStock: round2(Math.max(0, stock[invId] - total)), lastUpdated: FieldValue.serverTimestamp(), updatedBy: recordedBy });
    }
    const stockDeduction = {
      at: FieldValue.serverTimestamp(),
      by,
      calcMode: manual && Object.keys(manual).length ? "manual" : "auto",
      ...(reason ? { reason } : {}),
      items: items.map(({ deducted: _d, ...rest }) => rest),
      skipped,
      skippedNoPer100,
      reversed: false,
    };
    tx.update(bookingRef, { stockDeduction, updatedBy: recordedBy, updatedAt: FieldValue.serverTimestamp() });
    return { ...stockDeduction, at: new Date().toISOString() } as Doc;
  });
}

/** Trigger: booking status → Completed, settings.autoStockDeduct on (default) → deduct automatically. */
export const stockOnBookingCompleted = onDocumentWritten(
  { document: "bookings/{bookingId}", region: REGION },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
    if (!after || after.status !== "Completed" || before?.status === "Completed") return;
    const settings = await loadSettings();
    if (!shouldAutoDeduct(before, after, settings.autoStockDeduct)) return;
    try {
      await applyStockForBooking(event.params.bookingId, "auto");
    } catch (e) {
      logger.error("automatic stock deduction failed", event.params.bookingId, e);
    }
  },
);

function who(caller: CallerContext): By {
  return { uid: caller.uid, name: caller.name };
}

/** applyEventStock { bookingId, items?: [{ groceryItemId, quantity }], reason? } (A, M). */
export const applyEventStock = callable("applyEventStock", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const bookingId = reqId(data, "bookingId");
  const raw = optArray(data, "items", 500);
  const settings = await loadSettings();
  let manual: Record<string, number> | undefined;
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";
  if (raw && raw.length) {
    assertCanOverride(caller, settings);
    if (reason.length < MIN_REASON_LENGTH) fail("invalid-argument", "మార్పుకి కారణం రాయండి (కనీసం 3 అక్షరాలు).", "A reason of at least 3 characters is required for manual quantities.");
    manual = {};
    raw.forEach((x, i) => {
      const o = asObj(x);
      const id = reqId(o, "groceryItemId");
      if (manual && id in manual) fail("invalid-argument", "ఒకే సరుకు రెండుసార్లు ఉంది.", "The same grocery item is listed twice.");
      (manual as Record<string, number>)[id] = checkNum(`items[${i}].quantity`, o.quantity, { min: 0 });
    });
  }
  const b = await db.collection(FirestoreCollections.BOOKINGS).doc(bookingId).get();
  if (!b.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  const booking = b.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(booking.branchId));
  if (asStr(booking.status) === "Cancelled") fail("failed-precondition", "Cancel అయిన booking కి stock తీయలేము.", "Booking is cancelled.");
  const res = await applyStockForBooking(bookingId, who(caller), manual, reason);
  if (!res) fail("failed-precondition", "ఈ event కి stock ఇప్పటికే తీసేశారు. మళ్ళీ చేయాలంటే ముందు reverse చేయండి.", "Stock was already deducted for this event; reverse it first.");
  if (manual) await auditOverride(caller, "applyEventStock:manual", FirestoreCollections.BOOKINGS, bookingId, null, manual, reason);
  else await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "applyEventStock", collection: FirestoreCollections.BOOKINGS, docId: bookingId });
  return { stockDeduction: res };
});

/**
 * Puts back what an event's deduction took (IN movements) and marks it reversed. Returns null when there is no live
 * deduction and `required` is false (used by cancelRecord); otherwise failed-precondition.
 */
export async function reverseStockForBooking(bookingId: string, by: { uid: string; name: string }, reason: string, required = true): Promise<{ returned: Record<string, number> } | null> {
  const db = getFirestore();
  const c = FirestoreCollections;
  const bookingRef = db.collection(c.BOOKINGS).doc(bookingId);
  return db.runTransaction(async (tx) => {
    const bSnap = await tx.get(bookingRef);
    if (!bSnap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
    const sd = asObj((bSnap.data() as Doc).stockDeduction);
    if (!Object.keys(sd).length || sd.reversed === true) {
      if (!required) return null;
      fail("failed-precondition", "తిరిగి వేయడానికి stock తీసినది ఏదీ లేదు.", "There is no stock deduction to reverse.");
    }
    const items = (Array.isArray(sd.items) ? sd.items : []).map(asObj);
    const back = new Map<string, number>();
    for (const it of items) {
      const taken = round2(Math.max(0, asNum(it.quantity) - asNum(it.shortBy)));
      if (taken > 0) back.set(asStr(it.inventoryItemId), round2((back.get(asStr(it.inventoryItemId)) ?? 0) + taken));
    }
    const ids = [...back.keys()].filter(Boolean);
    const snaps = ids.length ? await tx.getAll(...ids.map((id) => db.collection(c.INVENTORY).doc(id))) : [];
    snaps.forEach((s) => {
      if (!s.exists) return;
      const qty = back.get(s.id) as number;
      tx.set(s.ref.collection(c.MOVEMENTS).doc(), { type: "IN", quantity: qty, reason: "event-reversed", relatedBookingId: bookingId, bookingId, date: FieldValue.serverTimestamp(), recordedBy: by.uid });
      tx.update(s.ref, { quantityInStock: round2(asNum((s.data() as Doc).quantityInStock) + qty), lastUpdated: FieldValue.serverTimestamp(), updatedBy: by.uid });
    });
    tx.update(bookingRef, {
      "stockDeduction.reversed": true,
      "stockDeduction.reversedAt": FieldValue.serverTimestamp(),
      "stockDeduction.reversedBy": by,
      "stockDeduction.reverseReason": reason,
      updatedBy: by.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { returned: Object.fromEntries(back) };
  });
}

/** reverseEventStock { bookingId, reason } (A): IN movements for what was taken, reversed: true. */
export const reverseEventStock = callable("reverseEventStock", ADMIN, async (data, caller) => {
  const bookingId = reqId(data, "bookingId");
  const reason = reqString(data, "reason", 500);
  if (reason.length < MIN_REASON_LENGTH) fail("invalid-argument", "కారణం రాయండి (కనీసం 3 అక్షరాలు).", "A reason of at least 3 characters is required.");
  const result = (await reverseStockForBooking(bookingId, { uid: caller.uid, name: caller.name }, reason)) as { returned: Record<string, number> };
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "reverseEventStock", collection: FirestoreCollections.BOOKINGS, docId: bookingId, after: { ...result, reason } });
  return { reversed: true, returned: result.returned };
});
