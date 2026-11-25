/**
 * Module 5b (19 Nov 2026) — which Company and Brand a transaction belongs to (Master Data Freeze 01, §25
 * "Sale: Company + Brand + Branch + Customer + Booking + Event", brand rule 3 "Brand revenue and cost reports must
 * be separately available"). Pure rules; tested in test/module5b.test.ts.
 *
 * A booking gets its brand when it is created: the first brand its branch serves. The owner / manager can move it
 * to another brand that the same branch serves. An invoice copies the booking's brand at the moment it is made and
 * keeps it (brand rule 9: later brand changes do not rewrite finished documents). Older documents with no stamp
 * are read through their branch.
 */
type AnyDoc = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);

export interface Org {
  companyId: string;
  brandId: string;
}

/** The company of a branch and the brand it sells under by default ("" when the masters are not set up yet). */
export function orgOfBranch(branch: AnyDoc | undefined): Org {
  return { companyId: str(branch?.companyId), brandId: list(branch?.brandIds)[0] ?? "" };
}

/** The brand / company of a document: its own stamp, else its branch's default. */
export function orgOfDoc(doc: AnyDoc, branches: Map<string, AnyDoc>): Org {
  const fallback = orgOfBranch(branches.get(str(doc.branchId)));
  return { companyId: str(doc.companyId) || fallback.companyId, brandId: str(doc.brandId) || fallback.brandId };
}

/** May a booking of this branch be put under this brand? */
export function brandChangeProblem(branch: AnyDoc | undefined, brandId: string, brand: AnyDoc | undefined, booking: { status: string; hasInvoice: boolean }): "" | "no-brand" | "not-served" | "archived" | "closed" | "invoiced" {
  if (!brand) return "no-brand";
  if (str(brand.status) === "archived") return "archived";
  if (!list(branch?.brandIds).includes(brandId)) return "not-served";
  if (["Closed", "Cancelled", "cancelled"].includes(booking.status)) return "closed";
  if (booking.hasInvoice) return "invoiced";
  return "";
}

export interface BrandLine {
  brandId: string;
  name: string;
  events: number;
  invoiced: number;
  received: number;
  due: number;
  directCost: number;
  /** invoiced − direct cost */
  margin: number;
  marginPct: number | null;
}

/**
 * Revenue and direct cost by brand for one period. `bookings` / `invoices` are the period's documents; `costs` are
 * bills and expenses tagged to an event (the event decides the brand). Anything whose brand cannot be told goes to
 * the line with brandId "" so nothing is silently dropped.
 */
export function brandReport(
  brands: { id: string; name: string }[],
  branches: Map<string, AnyDoc>,
  bookings: { id: string; data: AnyDoc }[],
  invoices: AnyDoc[],
  costs: { bookingId: string; amount: number }[],
  /** brand of bookings outside the period that the period's invoices / costs still point at */
  otherBookingBrands: Map<string, string> = new Map(),
): { lines: BrandLine[]; totals: Omit<BrandLine, "brandId" | "name" | "marginPct"> } {
  const lines = new Map<string, BrandLine>();
  const line = (brandId: string) => {
    let l = lines.get(brandId);
    if (!l) {
      l = { brandId, name: brands.find((b) => b.id === brandId)?.name ?? "", events: 0, invoiced: 0, received: 0, due: 0, directCost: 0, margin: 0, marginPct: null };
      lines.set(brandId, l);
    }
    return l;
  };
  for (const b of brands) line(b.id);
  const bookingBrand = new Map<string, string>(otherBookingBrands);
  for (const b of bookings) {
    const brandId = orgOfDoc(b.data, branches).brandId;
    bookingBrand.set(b.id, brandId);
    if (!["Cancelled", "cancelled"].includes(str(b.data.status)) && b.data.isDeleted !== true) line(brandId).events++;
  }
  for (const i of invoices) {
    if (["Void", "Cancelled"].includes(str(i.status)) || i.isDeleted === true) continue;
    const brandId = str(i.brandId) || bookingBrand.get(str(i.bookingId)) || orgOfDoc(i, branches).brandId;
    const l = line(brandId);
    l.invoiced = r2(l.invoiced + Math.max(0, num(i.totalAmount)));
    l.received = r2(l.received + Math.max(0, num(i.amountPaid)));
    l.due = r2(l.due + Math.max(0, num(i.balanceDue)));
  }
  for (const c of costs) {
    const l = line(bookingBrand.get(c.bookingId) ?? "");
    l.directCost = r2(l.directCost + Math.max(0, c.amount));
  }
  const out = [...lines.values()].filter((l) => l.brandId !== "" || l.events || l.invoiced || l.directCost);
  for (const l of out) {
    l.margin = r2(l.invoiced - l.directCost);
    l.marginPct = l.invoiced > 0 ? Math.round((l.margin / l.invoiced) * 1000) / 10 : null;
  }
  out.sort((a, b) => (a.brandId === "" ? 1 : b.brandId === "" ? -1 : b.invoiced - a.invoiced));
  const sum = (f: (l: BrandLine) => number) => r2(out.reduce((a, l) => a + f(l), 0));
  return { lines: out, totals: { events: out.reduce((a, l) => a + l.events, 0), invoiced: sum((l) => l.invoiced), received: sum((l) => l.received), due: sum((l) => l.due), directCost: sum((l) => l.directCost), margin: sum((l) => l.margin) } };
}
