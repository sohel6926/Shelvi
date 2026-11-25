import { dayOfValue } from "../shared/istDate";
import { asObj, asStr, Doc } from "../shared/coerce";

/** Business days touched by a write: the date field(s) before and after (a date edit moves the doc). */
export function affectedDays(before: Doc | undefined, after: Doc | undefined, fields: string[]): string[] {
  const out = new Set<string>();
  for (const d of [before, after]) {
    if (!d) continue;
    for (const f of fields) {
      const day = dayOfValue(d[f]);
      if (day) out.add(day);
    }
  }
  return [...out].sort();
}

/** bookingIds whose event cost / profit may change because of this write. */
export function affectedBookings(before: Doc | undefined, after: Doc | undefined): string[] {
  const tagged = (d: Doc | undefined) => asStr(asObj(d?.costTarget).bookingId);
  return [...new Set([asStr(before?.bookingId), asStr(after?.bookingId), tagged(before), tagged(after)].filter(Boolean))];
}

