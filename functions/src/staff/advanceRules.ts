/** Pure: R10-1 staff advance documents → calc AdvanceIn. */
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { isLiveRecord } from "../shared/costTarget";
import { dayOfValue, monthOf } from "../shared/istDate";
import { AdvanceIn } from "../calc/round10";

export function readAdvance(id: string, d: Doc): AdvanceIn {
  const date = asStr(d.date) || dayOfValue(d.date) || dayOfValue(d.createdAt) || "";
  const raw = asStr(d.status);
  const status: AdvanceIn["status"] = !isLiveRecord(d) ? "Cancelled" : raw === "Open" || raw === "Recovered" ? raw : "legacy";
  return {
    id,
    amount: Math.max(0, asNum(d.amount)),
    recoverMonth: asStr(d.recoverMonth) || (date ? monthOf(date) : ""),
    date,
    status,
    recoveries: asArr(d.recoveries).map(asObj).map((r) => ({ month: asStr(r.month), amount: Math.max(0, asNum(r.amount)) })),
  };
}
