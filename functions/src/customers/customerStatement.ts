/** R10-7 customerStatement { customerId, from?, to? } (A/M): orders, invoices, payments, refunds, cancellation charges, running balance. */
import { getFirestore } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId } from "../shared/validate";
import { asStr, Doc } from "../shared/coerce";
import { isValidDay } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { statement } from "../calc/round10";
import { statementEntries, statementText } from "./statementRules";

export const customerStatement = callable("customerStatement", ADMIN_MANAGER, async (data) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const customerId = reqId(data, "customerId");
  const from = asStr(data.from) || null;
  const to = asStr(data.to) || null;
  if ((from && !isValidDay(from)) || (to && !isValidDay(to)) || (from && to && to < from)) fail("invalid-argument", "తేదీలు YYYY-MM-DD, ముగింపు మొదలు తర్వాత ఉండాలి.", "from / to must be YYYY-MM-DD with to ≥ from.");
  const [cSnap, bSnap, iSnap, settings] = await Promise.all([
    db.collection(c.CUSTOMERS).doc(customerId).get(),
    db.collection(c.BOOKINGS).where("customerId", "==", customerId).get(),
    db.collection(c.INVOICES).where("customerId", "==", customerId).get(),
    loadSettings(),
  ]);
  if (!cSnap.exists) fail("not-found", "కస్టమర్ దొరకలేదు.", "Customer not found.");
  const customer = cSnap.data() as Doc;
  const invoices = await Promise.all(
    iSnap.docs.map(async (d) => ({ id: d.id, data: d.data() as Doc, payments: (await d.ref.collection(c.PAYMENTS).get()).docs.map((p) => ({ id: p.id, data: p.data() as Doc })) })),
  );
  const entries = statementEntries(bSnap.docs.map((d) => ({ id: d.id, data: d.data() as Doc })), invoices);
  const s = statement(entries, from, to);
  return {
    customerId,
    customerName: asStr(customer.name),
    phone: asStr(customer.phone),
    from,
    to,
    ...s,
    whatsappText: statementText({ customer: asStr(customer.name), business: settings.brandName || settings.name, from, to, opening: s.opening, lines: s.lines, closing: s.closing }),
  };
});
