/**
 * Module 2g (18 Nov 2026) — stock reserved for confirmed events.
 *  - recomputeReservations: plans every confirmed / in-progress event of the next settings.stockReserve.days days,
 *    shares the stock out in date order and writes stockReservations/{bookingId} + 🔒 inventory.reservedQty.
 *  - It runs every hour, when a booking's status / date / guests / menu changes, and from refreshStockReservations.
 * Reservations never change quantityInStock. Written only here.
 */
import { REGION, TIME_ZONE } from "../setup";
import { getFirestore, FieldValue, Timestamp, DocumentSnapshot, WriteBatch } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asNum, asStr, Doc } from "../shared/coerce";
import { addDays, dayRange, istDay, todayIST, toDateValue } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { planForBooking, PlanContext } from "../kitchen/eventPlan";
import { allocate, EventNeed, holdsStock, reservationInputsChanged, shouldRecompute, stockChanged } from "./reservationRules";
import { usableStock } from "./batchRules";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export async function recomputeReservations(): Promise<{ events: number; items: number; short: number }> {
  const db = getFirestore();
  const c = FirestoreCollections;
  const settings = await loadSettings();
  const cfg = settings.stockReserve;
  const today = todayIST();
  const events: (EventNeed & { branchId: string; customer: string })[] = [];
  const names = new Map<string, { name: string; unit: string }>();

  if (cfg.on) {
    const from = dayRange(today).start;
    const to = dayRange(addDays(today, cfg.days)).end;
    const snap = await db.collection(c.BOOKINGS).where("eventDate", ">=", Timestamp.fromDate(from)).where("eventDate", "<", Timestamp.fromDate(to)).get();
    const ctx = new PlanContext();
    for (const d of snap.docs) {
      const b = d.data() as Doc;
      if (!holdsStock(b)) continue;
      try {
        const plan = await planForBooking(d.id, b, undefined, ctx);
        const needs: Record<string, number> = {};
        for (const i of plan.ingredients) {
          if (!i.inventoryItemId || !(i.gross > 0)) continue;
          needs[i.inventoryItemId] = r3((needs[i.inventoryItemId] ?? 0) + i.gross);
          names.set(i.inventoryItemId, { name: i.nameEn || i.nameTe, unit: i.unit });
        }
        if (Object.keys(needs).length) events.push({ bookingId: d.id, day: istDay(toDateValue(b.eventDate) ?? new Date()), needs, branchId: asStr(b.branchId), customer: asStr(b.customerNameSnapshot) });
      } catch (e) {
        logger.error("reservation: planning failed", d.id, e);
      }
    }
  }

  const itemIds = [...new Set(events.flatMap((e) => Object.keys(e.needs)))];
  const stock: Record<string, number> = {};
  for (let i = 0; i < itemIds.length; i += 300) {
    const snaps = await db.getAll(...itemIds.slice(i, i + 300).map((id) => db.collection(c.INVENTORY).doc(id)));
    snaps.forEach((s) => {
      // X7: expired stock cannot be promised to an event
      if (s.exists) stock[s.id] = usableStock(asNum((s.data() as Doc).quantityInStock), asNum((s.data() as Doc).expiredQty));
    });
  }
  const { byEvent, reserved } = allocate(events, stock);

  // Write the new picture, remove what no longer holds.
  const [oldRes, oldInv] = await Promise.all([db.collection(c.STOCK_RESERVATIONS).get(), db.collection(c.INVENTORY).where("reservedQty", ">", 0).get()]);
  const ops: ((b: WriteBatch) => void)[] = [];
  const keep = new Set<string>();
  let short = 0;
  for (const e of events) {
    const lines = (byEvent[e.bookingId] ?? []).map((l) => ({ ...l, name: names.get(l.inventoryItemId)?.name ?? "", unit: names.get(l.inventoryItemId)?.unit ?? "" }));
    if (!lines.length) continue;
    keep.add(e.bookingId);
    if (lines.some((l) => l.short > 0)) short++;
    ops.push((b) => b.set(db.collection(c.STOCK_RESERVATIONS).doc(e.bookingId), { bookingId: e.bookingId, branchId: e.branchId, day: e.day, customer: e.customer, lines, itemIds: lines.filter((l) => l.reserved > 0).map((l) => l.inventoryItemId).slice(0, 500), shortCount: lines.filter((l) => l.short > 0).length, updatedAt: FieldValue.serverTimestamp() }));
  }
  for (const d of oldRes.docs) if (!keep.has(d.id)) ops.push((b) => b.delete(d.ref));
  const had = new Map(oldInv.docs.map((d) => [d.id, asNum((d.data() as Doc).reservedQty)]));
  for (const id of new Set([...had.keys(), ...Object.keys(reserved)])) {
    const now = reserved[id] ?? 0;
    if (id in stock || had.has(id)) if (r3(had.get(id) ?? 0) !== r3(now)) ops.push((b) => b.update(db.collection(c.INVENTORY).doc(id), { reservedQty: now }));
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  return { events: keep.size, items: Object.keys(reserved).length, short };
}

const stateRef = () => getFirestore().collection(FirestoreCollections.SETTINGS).doc("reservationState");

/**
 * Every 5 minutes: recompute when stock changed since the last run (X8 — a purchase, a count, a deduction), or when an
 * hour has passed (dates move on). One cheap read on the other runs.
 */
export const reservationsHourly = onSchedule({ schedule: "every 5 minutes", timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 300 }, async () => {
  const st = ((await stateRef().get()).data() ?? {}) as Doc;
  const lastRunMs = st.lastRunAt instanceof Timestamp ? st.lastRunAt.toMillis() : 0;
  if (!shouldRecompute(st.dirty === true, lastRunMs, Date.now())) return;
  await stateRef().set({ dirty: false, lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
  await recomputeReservations();
});

/** X8: any change of a stock item's quantity (or of its expired part) marks the reservations as out of date. */
export const reservationsDirtyOnStock = onDocumentWritten(
  { document: "inventory/{itemId}", region: REGION },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
    if (!stockChanged(before, after)) return;
    await stateRef().set({ dirty: true, dirtyAt: FieldValue.serverTimestamp() }, { merge: true });
  },
);

export const reservationsOnBookingChange = onDocumentWritten(
  { document: "bookings/{bookingId}", region: REGION, timeoutSeconds: 300 },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
    if (!reservationInputsChanged(before, after)) return;
    try {
      await recomputeReservations();
    } catch (e) {
      logger.error("reservation recompute failed", event.params.bookingId, e);
    }
  },
);

/** refreshStockReservations {} (owner / manager): recompute now, e.g. after a purchase. */
export const refreshStockReservations = callable("refreshStockReservations", ADMIN_MANAGER, async () => {
  const r = await recomputeReservations();
  return { ok: true, ...r };
});
