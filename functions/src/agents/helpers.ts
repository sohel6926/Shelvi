/** Pure helpers used by agents (unit tested). */
import { dayOfValue, toDateValue } from "../shared/istDate";
import { defaultServeTime, MEAL_TYPES, MealType, TimelineInput } from "../calc/timeline";
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";

/**
 * §12 inputs from a booking (contract Round 6 C): serveTime "HH:MM" else the package deliveryWindow start else the
 * meal default; mealType from the booking, else the package, else "other"; travelMinutes default 45;
 * guests = actual → confirmed → planned. defaultsUsed = serveTime, travelMinutes or mealType not set on the booking.
 */
export function timelineInputInfo(booking: Doc, menuPackage: Doc | undefined, eventDay: string): { input: TimelineInput; defaultsUsed: boolean } | null {
  const ownMeal = asStr(booking.mealType);
  const mealRaw = ownMeal || asStr(menuPackage?.mealType);
  const mealOk = (MEAL_TYPES as string[]).includes(mealRaw);
  const mealType: MealType = mealOk ? (mealRaw as MealType) : "other";
  const st = asStr(booking.serveTime);
  const serveOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(st);
  const serveTime = serveOk ? st : defaultServeTime(menuPackage?.deliveryWindow, mealType);
  const tm = booking.travelMinutes;
  const travelOk = typeof tm === "number" && Number.isInteger(tm) && tm >= 0 && tm <= 300;
  const travelMinutes = travelOk ? (tm as number) : 45;
  const guests = asNum(booking.guestCountActual) || asNum(booking.guestCountConfirmed) || asNum(booking.guestCount);
  if (!Number.isInteger(guests) || guests < 1) return null;
  const defaultsUsed = !serveOk || !travelOk || !(mealOk && ownMeal === mealRaw);
  return { input: { eventDay, serveTime, guests, mealType, travelMinutes }, defaultsUsed };
}

export function timelineInputFor(booking: Doc, menuPackage: Doc | undefined, eventDay: string): TimelineInput | null {
  return timelineInputInfo(booking, menuPackage, eventDay)?.input ?? null;
}

export function timelineText(steps: { day: string; time: string; te: string }[], eventDay: string): string {
  return steps.map((s) => `${s.day === eventDay ? "" : "(ముందు రోజు) "}${s.time} — ${s.te}`).join("\n");
}

export interface ExpiringBatch {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  expiryDay: string;
  daysLeft: number;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}

/**
 * FEFO (first-expiry-first-out): stock batches expiring within `withinDays` (or already expired),
 * earliest first. Supports `batches: [{ quantity, expiryDate }]` or a single `expiryDate` on the item.
 */
export function expiringFefo(items: { id: string; data: Doc }[], today: string, withinDays: number): ExpiringBatch[] {
  const out: ExpiringBatch[] = [];
  for (const { id, data } of items) {
    const batches = asArr(data.batches).length ? asArr(data.batches).map(asObj) : data.expiryDate ? [{ quantity: data.quantityInStock, expiryDate: data.expiryDate }] : [];
    for (const b of batches) {
      const exp = dayOfValue(b.expiryDate);
      const qty = asNum(b.quantity);
      if (!exp || qty <= 0) continue;
      const daysLeft = dayDiff(today, exp);
      if (daysLeft <= withinDays) out.push({ itemId: id, name: asStr(data.name), quantity: qty, unit: asStr(data.unit), expiryDay: exp, daysLeft });
    }
  }
  return out.sort((a, b) => a.expiryDay.localeCompare(b.expiryDay) || a.name.localeCompare(b.name));
}

export function isLowStock(d: Doc): boolean {
  return asNum(d.reorderLevel) > 0 && asNum(d.quantityInStock) <= asNum(d.reorderLevel);
}

/** Key identifying "the same item" across purchases: inventory id if linked, else description + unit. */
export function purchaseItemKey(it: Doc): string {
  const inv = asStr(it.inventoryItemId);
  return inv ? `inv:${inv}` : `d:${asStr(it.description).trim().toLowerCase()}|${asStr(it.unit).trim().toLowerCase()}`;
}

export function purchaseTime(p: Doc): number {
  return toDateValue(p.purchaseDate)?.getTime() ?? 0;
}

/** Firestore export (backup) request for the admin REST API. */
export function buildExportRequest(projectId: string, bucket: string, day: string): { url: string; body: { outputUriPrefix: string } } {
  return {
    url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`,
    body: { outputUriPrefix: `gs://${bucket}/backups/firestore/${day}` },
  };
}

export const VEHICLE_DOCS = [
  { field: "insuranceExpiry", te: "ఇన్సూరెన్స్", en: "Insurance" },
  { field: "fitnessExpiry", te: "ఫిట్‌నెస్", en: "Fitness" },
  { field: "pollutionExpiry", te: "పొల్యూషన్", en: "Pollution" },
  { field: "driverLicenseExpiry", te: "డ్రైవర్ లైసెన్స్", en: "Driver licence" },
] as const;

export interface VehicleExpiry {
  vehicleId: string;
  number: string;
  field: string;
  te: string;
  en: string;
  day: string;
  daysLeft: number;
}

/**
 * R7-4: vehicle papers expiring. `alertNow` = exactly 30 or 7 days before, or already expired (daily until renewed);
 * `soon` = expired or within 7 days (morning summary count). Archived vehicles are ignored.
 */
export function vehicleExpiries(vehicles: { id: string; data: Doc }[], today: string): { alertNow: VehicleExpiry[]; soon: VehicleExpiry[] } {
  const all: VehicleExpiry[] = [];
  for (const { id, data } of vehicles) {
    if (data.archived === true) continue;
    for (const d of VEHICLE_DOCS) {
      const day = dayOfValue(data[d.field]);
      if (!day) continue;
      all.push({ vehicleId: id, number: asStr(data.number), field: d.field, te: d.te, en: d.en, day, daysLeft: dayDiff(today, day) });
    }
  }
  all.sort((a, b) => a.daysLeft - b.daysLeft || a.number.localeCompare(b.number));
  return { alertNow: all.filter((x) => x.daysLeft === 30 || x.daysLeft === 7 || x.daysLeft <= 0), soon: all.filter((x) => x.daysLeft <= 7) };
}
