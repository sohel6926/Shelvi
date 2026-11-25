/**
 * Module 5b — stamping Company / Brand on bookings, changing a booking's brand, and the brand report.
 * Rules: orgRules.ts.
 */
import { REGION } from "../setup";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { callable, ADMIN, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqDay, reqId } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { istAt, addDays, dayOfValue } from "../shared/istDate";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { costTargetOf, isLiveRecord } from "../shared/costTarget";
import { brandChangeProblem, brandReport as buildBrandReport, orgOfBranch, orgOfDoc } from "./orgRules";

/** A new booking gets the company of its branch and the first brand that branch serves. */
export const stampBookingOrg = onDocumentCreated({ document: "bookings/{bookingId}", region: REGION }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const b = snap.data() as Doc;
  if (asStr(b.brandId) && asStr(b.companyId)) return;
  const branchId = asStr(b.branchId);
  if (!branchId) return;
  const branch = (await getFirestore().collection(FirestoreCollections.BRANCHES).doc(branchId).get()).data() as Doc | undefined;
  const org = orgOfBranch(branch);
  if (!org.companyId && !org.brandId) return; // masters not set up yet: read through the branch later
  await snap.ref.update({ ...(asStr(b.companyId) ? {} : { companyId: org.companyId }), ...(asStr(b.brandId) ? {} : { brandId: org.brandId }) });
});

/** setBookingBrand { bookingId, brandId } — owner / manager of the branch; only before the booking is invoiced or closed. */
export const setBookingBrand = callable("setBookingBrand", ADMIN_MANAGER, async (data, caller) => {
  const bookingId = reqId(data, "bookingId");
  const brandId = reqId(data, "brandId");
  const db = getFirestore();
  const c = FirestoreCollections;
  const ref = db.collection(c.BOOKINGS).doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "ఆ బుకింగ్ దొరకలేదు.", "That booking was not found.");
  const b = snap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(b.branchId));
  const [branchSnap, brandSnap, invoices] = await Promise.all([db.collection(c.BRANCHES).doc(asStr(b.branchId)).get(), db.collection("brands").doc(brandId).get(), db.collection(c.INVOICES).where("bookingId", "==", bookingId).get()]);
  const branch = branchSnap.data() as Doc | undefined;
  const hasInvoice = invoices.docs.some((d) => !["Void", "Cancelled"].includes(asStr((d.data() as Doc).status)));
  const problem = brandChangeProblem(branch, brandId, brandSnap.exists ? (brandSnap.data() as Doc) : undefined, { status: asStr(b.status), hasInvoice });
  if (problem === "no-brand") fail("not-found", "ఆ బ్రాండ్ దొరకలేదు.", "That brand was not found.");
  if (problem === "archived") fail("failed-precondition", "ఆ బ్రాండ్ ఆర్కైవ్ అయింది.", "That brand is archived.");
  if (problem === "not-served") fail("failed-precondition", "ఈ శాఖ ఆ బ్రాండ్‌కు పని చేయదు. ముందు శాఖ వివరాల్లో ఆ బ్రాండ్ చేర్చండి.", "This branch does not serve that brand. Add the brand to the branch first.");
  if (problem === "closed") fail("failed-precondition", "ముగిసిన / రద్దయిన బుకింగ్ బ్రాండ్ మార్చలేరు.", "The brand of a closed or cancelled booking cannot be changed.");
  if (problem === "invoiced") fail("failed-precondition", "ఇన్వాయిస్ చేసిన బుకింగ్ బ్రాండ్ మార్చలేరు.", "The brand of an invoiced booking cannot be changed.");
  const before = orgOfDoc(b, new Map([[asStr(b.branchId), branch ?? {}]]));
  await ref.update({ brandId, companyId: asStr(branch?.companyId) || before.companyId, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "setBookingBrand", collection: c.BOOKINGS, docId: bookingId, before: { brandId: before.brandId }, after: { brandId } });
  return { ok: true, brandId };
});

/** brandReport { from, to } — revenue and direct cost by brand for events / invoices dated in the period. */
export const brandReport = callable("brandReport", ADMIN, async (data) => {
  const from = reqDay(data, "from");
  const to = reqDay(data, "to");
  if (from > to) fail("invalid-argument", "మొదటి తేదీ చివరి తేదీ కంటే ముందు ఉండాలి.", "The from date must not be after the to date.");
  const db = getFirestore();
  const c = FirestoreCollections;
  const start = istAt(from, "00:00");
  const end = istAt(addDays(to, 1), "00:00");
  const range = (col: string, field: string) => db.collection(col).where(field, ">=", start).where(field, "<", end).get();
  const [brandsSnap, branchesSnap, bookingsSnap, invoicesSnap, purchases, expenses] = await Promise.all([db.collection("brands").get(), db.collection(c.BRANCHES).get(), range(c.BOOKINGS, "eventDate"), range(c.INVOICES, "issueDate"), range(c.PURCHASES, "purchaseDate"), range(c.EXPENSES, "serviceDate")]);
  const branches = new Map(branchesSnap.docs.map((d) => [d.id, d.data() as Doc]));
  const bookings = bookingsSnap.docs.map((d) => ({ id: d.id, data: d.data() as Doc }));
  const invoices = invoicesSnap.docs.map((d) => d.data() as Doc);
  const costs = [...purchases.docs, ...expenses.docs]
    .map((d) => d.data() as Doc)
    .filter(isLiveRecord)
    .flatMap((d) => {
      const t = costTargetOf(d);
      return t.type === "booking" ? [{ bookingId: t.bookingId, amount: Math.max(0, asNum(d.totalAmount)) }] : [];
    });
  // invoices / costs of the period may point at events outside it: fetch those bookings for their brand
  const known = new Set(bookings.map((b) => b.id));
  const missing = [...new Set([...invoices.map((i) => asStr(i.bookingId)), ...costs.map((x) => x.bookingId)].filter((id) => id && !known.has(id)))].slice(0, 300);
  const others = missing.length ? await db.getAll(...missing.map((id) => db.collection(c.BOOKINGS).doc(id))) : [];
  const otherBrands = new Map(others.filter((s) => s.exists).map((s) => [s.id, orgOfDoc(s.data() as Doc, branches).brandId]));
  const brands = brandsSnap.docs.map((d) => ({ id: d.id, name: asStr((d.data() as Doc).name) })).filter((b) => b.name);
  const out = buildBrandReport(brands, branches, bookings, invoices, costs, otherBrands);
  return { from, to, ...out, firstEventDay: bookings.map((b) => dayOfValue(b.data.eventDate) ?? "").filter(Boolean).sort()[0] ?? "" };
});
