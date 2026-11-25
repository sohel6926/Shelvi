import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { callable, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { checkNum, optArray, optNum, optString, reqArray, reqId } from "../shared/validate";
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { istAt } from "../shared/istDate";
import { assertAdminOrOwnBranch, CallerContext } from "../auth/authContext";
import { splitShared, sizeBand } from "../calc/recipes";
import { logKey, syncDishFromCookLog } from "./cookLearning";

/** Staff may only log for bookings they are assigned to (users/{uid}.staffId in assignedStaffIds). */
export function assertCanLogBooking(caller: CallerContext, booking: Doc): void {
  if (caller.role === "admin") return;
  if (caller.role === "manager") return assertAdminOrOwnBranch(caller, asStr(booking.branchId));
  const assigned = asArr(booking.assignedStaffIds).map(String);
  if (!caller.staffId || !assigned.includes(caller.staffId)) {
    fail("permission-denied", "మీకు assign చేసిన event కి మాత్రమే నమోదు చేయగలరు.", "You can only log events you are assigned to.");
  }
}

interface Entry {
  dishId: string;
  variantId: string;
  cooked: number;
  leftover: number;
  ingredients: Record<string, number>;
  sharedWith: { bookingId: string; sessionId: string; guests: number }[];
}

function parseEntries(raw: unknown[]): Entry[] {
  const entries = raw.map((e, i) => {
    const o = asObj(e);
    const dishId = reqId(o, "dishId");
    const variantId = (optString(o, "variantId", 100) ?? "").trim();
    const cooked = checkNum(`entries[${i}].cooked`, o.cooked, { min: 0, gt: true });
    const leftover = checkNum(`entries[${i}].leftover`, o.leftover, { min: 0 });
    if (leftover > cooked) fail("invalid-argument", `entries[${i}]: మిగిలింది వండిన దానికంటే ఎక్కువ ఉండకూడదు.`, `entries[${i}]: leftover cannot be more than cooked.`);
    const ingredients: Record<string, number> = {};
    for (const [j, x] of (optArray(o, "ingredients", 100) ?? []).entries()) {
      const io = asObj(x);
      const gid = reqId(io, "groceryItemId");
      const used = checkNum(`entries[${i}].ingredients[${j}].used`, io.used, { min: 0 });
      ingredients[gid] = (ingredients[gid] ?? 0) + used;
    }
    const sharedWith = (optArray(o, "sharedWith", 20) ?? []).map((x, j) => {
      const so = asObj(x);
      return { bookingId: reqId(so, "bookingId"), sessionId: (optString(so, "sessionId", 100) ?? "").trim(), guests: checkNum(`entries[${i}].sharedWith[${j}].guests`, so.guests, { int: true, min: 1 }) };
    });
    return { dishId, variantId, cooked, leftover, ingredients, sharedWith };
  });
  const keys = entries.map((e) => `${e.dishId}|${e.variantId}`);
  if (new Set(keys).size !== keys.length) fail("invalid-argument", "ఒకే వంటకం రెండుసార్లు ఉంది.", "The same dish (and variant) is listed twice.");
  return entries;
}

/**
 * saveCookLog v2 { bookingId, sessionId?, guestCountActual?, entries: [{ dishId, variantId?, cooked, leftover,
 * ingredients?: [{ groceryItemId, used }], sharedWith?: [{ bookingId, sessionId?, guests }] }] }.
 * A batch shared with other events is split by guests (§13, Σ shares = batch); every event stores its own share with
 * band + serviceStyle + comboKey. dishes.learned / dishes.recipe are recomputed on the server.
 */
export const saveCookLog = callable("saveCookLog", ALL_ROLES, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const bookingId = reqId(data, "bookingId");
  const sessionId = (optString(data, "sessionId", 100) ?? "").trim();
  const guestCountActual = optNum(data, "guestCountActual", { int: true, min: 1, max: 100000 });
  const entries = parseEntries(reqArray(data, "entries", 200));

  const bookingRef = db.collection(c.BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  const booking = bookingSnap.data() as Doc;
  assertCanLogBooking(caller, booking);
  if (booking.closed) fail("failed-precondition", "ఈ event close అయింది.", "This event is closed.");
  if (sessionId && !asArr(booking.sessions).map(asObj).some((s) => asStr(s.id) === sessionId)) fail("not-found", "ఆ session దొరకలేదు.", "Session not found.");

  const dishSnaps = await Promise.all(entries.map((e) => db.collection(c.DISHES).doc(e.dishId).get()));
  dishSnaps.forEach((s, i) => {
    if (!s.exists) fail("not-found", `వంటకం ${entries[i].dishId} దొరకలేదు.`, `Dish ${entries[i].dishId} not found.`);
  });

  if (guestCountActual !== undefined) {
    if (sessionId) {
      const sessions = asArr(booking.sessions).map(asObj).map((s) => (asStr(s.id) === sessionId ? { ...s, guestCountActual } : s));
      await bookingRef.update({ sessions, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
      booking.sessions = sessions;
    } else {
      await bookingRef.update({ guestCountActual, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
      booking.guestCountActual = guestCountActual;
    }
  }

  const { eventContext } = await import("./eventPlan");
  const thisCtx = await eventContext(bookingId, booking, sessionId);
  if (!thisCtx || !(thisCtx.guests >= 1)) fail("failed-precondition", "అతిథుల సంఖ్య లేదు.", "No guest count for this event.");
  const others = new Map<string, { booking: Doc; ctx: NonNullable<typeof thisCtx> }>();
  for (const e of entries) {
    for (const s of e.sharedWith) {
      const k = `${s.bookingId}|${s.sessionId}`;
      if (k === `${bookingId}|${sessionId}`) fail("invalid-argument", "ఈ event ని మళ్ళీ shared లో ఇవ్వకండి.", "sharedWith must list the other events only.");
      if (others.has(k)) continue;
      const ob = await db.collection(c.BOOKINGS).doc(s.bookingId).get();
      if (!ob.exists) fail("not-found", `Booking ${s.bookingId} దొరకలేదు.`, `Booking ${s.bookingId} not found.`);
      const obd = ob.data() as Doc;
      assertCanLogBooking(caller, obd);
      const octx = await eventContext(s.bookingId, obd, s.sessionId);
      if (!octx) fail("not-found", "ఆ session దొరకలేదు.", "Shared session not found.");
      others.set(k, { booking: obd, ctx: { ...octx, guests: s.guests, band: sizeBand(s.guests) } });
    }
  }

  const batch = db.batch();
  const written: { bookingId: string; logId: string }[] = [];
  const write = (bId: string, b: Doc, sId: string, ctx: NonNullable<typeof thisCtx>, e: Entry, share: { cooked: number; leftover: number; ingredients: Record<string, number> }, i: number, shared: Doc | null) => {
    const logId = logKey(e.dishId, e.variantId, sId);
    batch.set(db.collection(c.BOOKINGS).doc(bId).collection(c.COOK_LOG).doc(logId), {
      dishId: e.dishId,
      variantId: e.variantId,
      sessionId: sId,
      unit: asStr((dishSnaps[i].data() as Doc).unit),
      cooked: share.cooked,
      leftover: share.leftover,
      ingredients: share.ingredients,
      guests: ctx.guests,
      band: ctx.band,
      serviceStyle: ctx.serviceStyle,
      comboKey: ctx.comboKey,
      eventAt: Timestamp.fromDate(istAt(ctx.day || "2000-01-01")),
      sharedBatch: shared,
      branchId: asStr(b.branchId),
      recordedBy: caller.uid,
      recordedAt: FieldValue.serverTimestamp(),
    });
    written.push({ bookingId: bId, logId });
  };
  entries.forEach((e, i) => {
    const batchIn = { cooked: e.cooked, leftover: e.leftover, ingredients: e.ingredients };
    if (!e.sharedWith.length) return write(bookingId, booking, sessionId, thisCtx, e, batchIn, i, null);
    const parts = [{ key: `${bookingId}|${sessionId}`, guests: thisCtx.guests }, ...e.sharedWith.map((s) => ({ key: `${s.bookingId}|${s.sessionId}`, guests: s.guests }))];
    const shares = splitShared(batchIn, parts);
    const shared = { ...batchIn, parts: parts.map((p) => ({ key: p.key, guests: p.guests })) };
    write(bookingId, booking, sessionId, thisCtx, e, shares[parts[0].key], i, shared);
    for (const s of e.sharedWith) {
      const o = others.get(`${s.bookingId}|${s.sessionId}`) as { booking: Doc; ctx: NonNullable<typeof thisCtx> };
      write(s.bookingId, o.booking, s.sessionId, o.ctx, e, shares[`${s.bookingId}|${s.sessionId}`], i, shared);
    }
  });
  await batch.commit();

  const updatedDishes = [];
  for (const w of written.filter((x) => x.bookingId === bookingId)) {
    const learned = await syncDishFromCookLog(w.bookingId, w.logId);
    updatedDishes.push({ dishId: w.logId.split("__")[0], logId: w.logId, learned });
  }
  for (const w of written.filter((x) => x.bookingId !== bookingId)) await syncDishFromCookLog(w.bookingId, w.logId);
  return { updatedDishes };
});
