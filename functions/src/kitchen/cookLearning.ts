import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asNum, asStr, Doc } from "../shared/coerce";
import { toDateValue } from "../shared/istDate";
import { byVariant, HistoryLine, learnedSummary, readHistoryLine, recipeSummary, variantTypedRecipe } from "./recipeSummary";

/** Guests used for learning: actual → confirmed → planned. */
export function bookingGuests(b: Doc): number {
  return asNum(b.guestCountActual) || asNum(b.guestCountConfirmed) || asNum(b.guestCount);
}

/** cookLog doc id: dishId, plus variant and session when given (legacy logs are just the dishId). */
export function logKey(dishId: string, variantId?: string, sessionId?: string): string {
  return [dishId, variantId ? `v-${variantId}` : "", sessionId ? `s-${sessionId}` : ""].filter(Boolean).join("__");
}

export function dishIdOfLogKey(logId: string): string {
  return logId.split("__")[0];
}

/**
 * Copies bookings/{bookingId}/cookLog/{logId} into dishes/{dishId}/history/{bookingId}__{logId} (or removes it when
 * the log line is gone), then recomputes dishes/{dishId}.learned and .recipe (§13). Idempotent.
 */
export async function syncDishFromCookLog(bookingId: string, logId: string): Promise<Doc | null> {
  const db = getFirestore();
  const c = FirestoreCollections;
  const logSnap = await db.collection(c.BOOKINGS).doc(bookingId).collection(c.COOK_LOG).doc(logId).get();
  const log = logSnap.data() as Doc | undefined;
  const dishId = asStr(log?.dishId) || dishIdOfLogKey(logId);
  const dishRef = db.collection(c.DISHES).doc(dishId);
  if (!(await dishRef.get()).exists) return null;
  const histRef = dishRef.collection(c.DISH_HISTORY).doc(`${bookingId}__${logId}`);
  if (log && asNum(log.cooked) > 0) {
    const booking = ((await db.collection(c.BOOKINGS).doc(bookingId).get()).data() ?? {}) as Doc;
    const guests = asNum(log.guests) || bookingGuests(booking);
    const eventAt = toDateValue(log.eventAt) ?? toDateValue(booking.eventDate) ?? new Date();
    if (guests > 0) {
      await histRef.set({
        bookingId,
        sessionId: asStr(log.sessionId),
        variantId: asStr(log.variantId),
        guests,
        cooked: asNum(log.cooked),
        leftover: asNum(log.leftover),
        band: asStr(log.band),
        serviceStyle: asStr(log.serviceStyle),
        comboKey: asStr(log.comboKey),
        ingredients: log.ingredients ?? {},
        unit: asStr(log.unit),
        eventTypeCode: asStr(booking.eventTypeCode, "other"),
        eventAt: Timestamp.fromDate(eventAt),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else await histRef.delete();
  } else {
    await histRef.delete();
  }
  return recomputeDishLearned(dishId);
}

/** Recomputes dishes/{id}.learned (+ variants) and dishes/{id}.recipe from its history (§13). */
export async function recomputeDishLearned(dishId: string): Promise<Doc | null> {
  const db = getFirestore();
  const dishRef = db.collection(FirestoreCollections.DISHES).doc(dishId);
  const dish = await dishRef.get();
  if (!dish.exists) return null;
  const d = dish.data() as Doc;
  const base = asNum(d.basePer100);
  const hist = await dishRef.collection(FirestoreCollections.DISH_HISTORY).get();
  const lines = hist.docs
    .map((h) => readHistoryLine(h.data() as Doc, toDateValue((h.data() as Doc).eventAt)?.getTime() ?? 0))
    .filter((l): l is HistoryLine => l !== null);
  const groups = byVariant(lines);
  const plain = groups.get("") ?? [];
  const learnedVariants: Doc = {};
  const recipeVariants: Doc = {};
  for (const [vid, ls] of groups) {
    if (!vid) continue;
    learnedVariants[vid] = learnedSummary(ls, base);
    recipeVariants[vid] = recipeSummary(ls, variantTypedRecipe(d, vid));
  }
  const learned = { ...learnedSummary(plain, base), variants: learnedVariants, updatedAt: FieldValue.serverTimestamp() };
  const recipe = { ...recipeSummary(plain, variantTypedRecipe(d, "")), variants: recipeVariants, updatedAt: FieldValue.serverTimestamp() };
  await dishRef.update({ learned, recipe, updatedBy: "system" });
  return { ...learned, updatedAt: null };
}
