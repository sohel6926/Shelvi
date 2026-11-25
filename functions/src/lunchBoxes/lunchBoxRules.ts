/** Pure: R10-12 lunch box order documents → calc LunchBoxOrderIn. */
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { isLiveRecord } from "../shared/costTarget";
import { isValidDay } from "../shared/istDate";
import { LunchBoxOrderIn, WEEKDAYS } from "../calc/round10";

export function readLunchBoxOrder(id: string, d: Doc, defaultPrice: number): LunchBoxOrderIn {
  const days = asArr(d.days).map((x) => String(x).toLowerCase().slice(0, 3)).filter((x) => (WEEKDAYS as readonly string[]).includes(x));
  return {
    id,
    ...(isValidDay(asStr(d.date)) ? { date: asStr(d.date) } : {}),
    ...(days.length ? { days } : {}),
    ...(isValidDay(asStr(d.startDate)) ? { startDate: asStr(d.startDate) } : {}),
    ...(isValidDay(asStr(d.endDate)) ? { endDate: asStr(d.endDate) } : {}),
    count: Math.max(0, Math.floor(asNum(d.count))),
    pricePerBox: d.pricePerBox === undefined || d.pricePerBox === null ? defaultPrice : Math.max(0, asNum(d.pricePerBox)),
    status: isLiveRecord(d) ? asStr(d.status, "active") : "cancelled",
  };
}

/** deliveries map stored on the order: { "YYYY-MM-DD": boxes delivered } */
export function deliveriesOf(d: Doc): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(asObj(d.deliveries))) if (isValidDay(k) && typeof v === "number") out[k] = v;
  return out;
}
