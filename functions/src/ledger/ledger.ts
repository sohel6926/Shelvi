/**
 * Module 4b (19 Nov 2026) — the books, owner only.
 *  - ledgerReport { from, to, account? }: trial balance and balance sheet as on `to`, profit & loss for from → to,
 *    all worked out from the money documents at the moment of asking (ledgerSources). With `account`, also the
 *    lines of that account in the period.
 *  - saveJournalEntry { day, memo, lines[{ account, debit?, credit? }] }: a hand-written entry (capital put in,
 *    drawings, opening balances, corrections). cancelJournalEntry { id, reason }.
 *  - lockPeriod { month } / unlockPeriod { reason }: settings/periodLock.lockedThrough. Only an ended month can be
 *    locked, only moving forward; only the last locked month can be reopened. Hand-written entries respect the lock
 *    here; making every other money callable respect it is Module 4c.
 */
import { OVERHEAD_BASES, OverheadBasis, EventLine, overheadPool, overheadTotals, shareOverhead } from "./overheadRules";
import { costTargetOf, isLiveRecord } from "../shared/costTarget";
import { loadBookingCost } from "../stats/bookingCost";
import { liveSessions, sessionGuests } from "../events/sessions";
import { readPayMany } from "../staff/pay";
import { buildCloseChecklist, countEventsWithoutInvoice, payrollGaps } from "./closeRules";
import { bookMoves, parseStatement, reconcile, shiftDay } from "./reconRules";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { LOCK_DOC, lockedThrough } from "./lockGuard";
import { callable, ADMIN, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqDay, reqId, reqMonth, reqString } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { addMonths, dayOfValue, istAt, todayIST } from "../shared/istDate";
import { ACCOUNTS, accountOf, balanceSheet, isLockedDay, lockProblem, parseManualEntry, profitAndLoss, trialBalance, unlockTarget } from "./ledgerRules";
import { allEntries, LedgerDocs, splitByPeriod } from "./ledgerSources";
import { exportRows } from "./exportRules";

const stamp = () => FieldValue.serverTimestamp();
/** First instant that is NOT locked (start of the month after `month`, IST) — what firestore.rules compares dates with. */
const lockedUntil = (month: string) => (month ? Timestamp.fromDate(istAt(`${addMonths(month, 1)}-01`, "00:00")) : Timestamp.fromMillis(0));

async function loadDocs(): Promise<LedgerDocs> {
  const db = getFirestore();
  const c = FirestoreCollections;
  const rows = async (name: string) => (await db.collection(name).get()).docs.map((d) => ({ id: d.id, data: d.data() as Doc }));
  const [invoices, payments, purchases, expenses, outsideOrders, vendorPayments, packedSales, staffAdvances, payroll, journalEntries, salaryPayments] = await Promise.all([
    rows(c.INVOICES),
    db.collectionGroup(c.PAYMENTS).get(),
    rows(c.PURCHASES),
    rows(c.EXPENSES),
    rows(c.OUTSIDE_ORDERS),
    rows(c.VENDOR_PAYMENTS),
    rows(c.PACKED_SALES),
    rows(c.STAFF_ADVANCES),
    rows(c.PAYROLL),
    rows(c.JOURNAL_ENTRIES),
    rows(c.SALARY_PAYMENTS),
  ]);
  // only invoices/{id}/payments/{id}; the old top-level payments mirror is the same money and is left out
  const byInvoice = new Map<string, { id: string; data: Doc }[]>();
  for (const p of payments.docs) {
    const parent = p.ref.parent.parent;
    if (!parent || parent.parent.id !== c.INVOICES) continue;
    const list = byInvoice.get(parent.id) ?? [];
    list.push({ id: p.id, data: p.data() as Doc });
    byInvoice.set(parent.id, list);
  }
  return { invoices: invoices.map((i) => ({ ...i, payments: byInvoice.get(i.id) ?? [] })), purchases, expenses, outsideOrders, vendorPayments, packedSales, staffAdvances, payroll, journalEntries, salaryPayments };
}

export const ledgerReport = callable("ledgerReport", ADMIN, async (data) => {
  const from = reqDay(data, "from");
  const to = reqDay(data, "to");
  if (from > to) fail("invalid-argument", "మొదటి తేదీ చివరి తేదీ కంటే ముందు ఉండాలి.", "The from date must not be after the to date.");
  const account = asStr(data.account);
  if (account && !accountOf(account)) fail("invalid-argument", "ఖాతా సరిగా లేదు.", "The account is not valid.");
  const [docs, locked] = await Promise.all([loadDocs(), lockedThrough()]);
  const { upTo, inPeriod } = splitByPeriod(allEntries(docs), from, to);
  const asOn = trialBalance(upTo);
  const period = trialBalance(inPeriod);
  const lines = account
    ? inPeriod
        .flatMap((e) => e.lines.filter((l) => l.account === account).map((l) => ({ day: e.day, memo: e.memo, kind: e.source.kind, collection: e.source.collection, id: e.source.id, debit: l.debit, credit: l.credit })))
        .slice(0, 500)
    : [];
  return {
    from,
    to,
    accounts: ACCOUNTS.map((a) => ({ code: a.code, type: a.type, te: a.te, en: a.en })),
    trialBalance: asOn.rows,
    totals: { debit: asOn.totalDebit, credit: asOn.totalCredit, balanced: asOn.balanced },
    balanceSheet: balanceSheet(asOn),
    profitAndLoss: profitAndLoss(period),
    entryCount: upTo.length,
    /** entries left out because they do not balance (should be 0) */
    skipped: asOn.skipped,
    lockedThrough: locked,
    lines,
  };
});

export const saveJournalEntry = callable("saveJournalEntry", ADMIN, async (data, caller) => {
  const today = todayIST();
  const parsed = parseManualEntry(data, today);
  if (!parsed.ok) fail("invalid-argument", parsed.te, parsed.en);
  const locked = await lockedThrough();
  if (isLockedDay(parsed.value.day, locked)) fail("failed-precondition", `${locked} వరకు పుస్తకాలు లాక్ అయ్యాయి. ఆ తేదీతో ఎంట్రీ రాయలేరు.`, `The books are locked through ${locked}. An entry can't be dated in a locked month.`);
  const ref = getFirestore().collection(FirestoreCollections.JOURNAL_ENTRIES).doc();
  await ref.set({ ...parsed.value, cancelled: false, createdBy: caller.uid, createdByName: caller.name, createdAt: stamp() });
  return { ok: true, id: ref.id };
});

export const cancelJournalEntry = callable("cancelJournalEntry", ADMIN, async (data, caller) => {
  const id = reqId(data, "id");
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.JOURNAL_ENTRIES).doc(id);
  const locked = await lockedThrough();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ ఎంట్రీ దొరకలేదు.", "Journal entry not found.");
    const cur = snap.data() as Doc;
    if (cur.cancelled === true) fail("failed-precondition", "ఈ ఎంట్రీ ఇప్పటికే రద్దు అయింది.", "This entry is already cancelled.");
    if (isLockedDay(asStr(cur.day), locked)) fail("failed-precondition", `${locked} వరకు పుస్తకాలు లాక్ అయ్యాయి. ఈ ఎంట్రీని రద్దు చేయలేరు.`, `The books are locked through ${locked}. This entry can't be cancelled.`);
    tx.update(ref, { cancelled: true, cancelReason: reason, cancelledBy: caller.uid, cancelledAt: stamp() });
    return { ok: true };
  });
});

export const lockPeriod = callable("lockPeriod", ADMIN_MANAGER, async (data, caller) => {
  const month = reqMonth(data, "month");
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.SETTINGS).doc(LOCK_DOC);
  return db.runTransaction(async (tx) => {
    const cur = asStr(((await tx.get(ref)).data() ?? {}).lockedThrough);
    const p = lockProblem(month, cur, todayIST());
    if (p === "not-ended") fail("failed-precondition", "ముగిసిన నెలను మాత్రమే లాక్ చేయగలరు.", "Only a month that has ended can be locked.");
    if (p === "already-locked") fail("failed-precondition", `${cur} వరకు ఇప్పటికే లాక్ అయింది.`, `Already locked through ${cur}.`);
    if (p) fail("invalid-argument", "నెల సరిగా లేదు.", "The month is not valid.");
    tx.set(ref, { lockedThrough: month, lockedUntil: lockedUntil(month), lockedBy: caller.uid, lockedByName: caller.name, lockedAt: stamp(), history: FieldValue.arrayUnion({ action: "lock", month, by: caller.uid, byName: caller.name, on: todayIST() }) }, { merge: true });
    return { ok: true, lockedThrough: month };
  });
});

export const unlockPeriod = callable("unlockPeriod", ADMIN, async (data, caller) => {
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.SETTINGS).doc(LOCK_DOC);
  return db.runTransaction(async (tx) => {
    const cur = asStr(((await tx.get(ref)).data() ?? {}).lockedThrough);
    if (!cur) fail("failed-precondition", "ఏ నెలా లాక్ కాలేదు.", "No month is locked.");
    const next = unlockTarget(cur);
    tx.set(ref, { lockedThrough: next, lockedUntil: lockedUntil(next), history: FieldValue.arrayUnion({ action: "unlock", month: cur, reason, by: caller.uid, byName: caller.name, on: todayIST() }) }, { merge: true });
    return { ok: true, lockedThrough: next, reopened: cur };
  });
});

/**
 * reconcileStatement { grid, account?, toleranceDays? } — Module 4f. `grid` is the uploaded bank statement as rows of
 * cells (the web reads the Excel / CSV file and sends it as it is). Returns what pairs with the books on the bank
 * (or cash) account and what is left on either side. Nothing is stored.
 */
export const reconcileStatement = callable("reconcileStatement", ADMIN, async (data) => {
  const grid = data.grid;
  if (!Array.isArray(grid) || grid.length === 0) fail("invalid-argument", "స్టేట్‌మెంట్ ఫైల్ ఖాళీగా ఉంది.", "The statement file is empty.");
  if (grid.length > 5000) fail("invalid-argument", "ఫైల్ చాలా పెద్దది (5,000 వరుసల వరకు). నెల వారీగా అప్‌లోడ్ చేయండి.", "The file is too big (up to 5,000 rows). Upload month by month.");
  const account = asStr(data.account) || "1010";
  if (account !== "1010" && account !== "1000") fail("invalid-argument", "ఖాతా సరిగా లేదు.", "The account is not valid.");
  const tol = typeof data.toleranceDays === "number" && data.toleranceDays >= 0 && data.toleranceDays <= 15 ? Math.round(data.toleranceDays) : 3;
  const parsed = parseStatement((grid as unknown[]).map((r) => (Array.isArray(r) ? r.slice(0, 40) : [])));
  if (parsed.problem === "no-header") fail("invalid-argument", "ఈ ఫైల్‌లో తేదీ, జమ / ఖర్చు కాలమ్‌లు దొరకలేదు. బ్యాంక్ ఇచ్చిన స్టేట్‌మెంట్ ఫైల్‌నే అప్‌లోడ్ చేయండి.", "Could not find the date and debit / credit columns. Upload the statement file as the bank gives it.");
  if (parsed.problem === "no-rows") fail("invalid-argument", "స్టేట్‌మెంట్‌లో లావాదేవీలు దొరకలేదు.", "No transactions were found in the statement.");
  const first = parsed.rows.reduce((a, r) => (r.day < a ? r.day : a), parsed.rows[0].day);
  const last = parsed.rows.reduce((a, r) => (r.day > a ? r.day : a), parsed.rows[0].day);
  const books = bookMoves(allEntries(await loadDocs()), account, shiftDay(first, -tol), shiftDay(last, tol));
  const r = reconcile(parsed.rows, books, tol);
  return {
    account, from: first, to: last, toleranceDays: tol, statementRows: parsed.rows.length, skipped: parsed.skipped,
    matchedCount: r.matched.length,
    matched: r.matched.slice(0, 300).map((m) => ({ day: m.statement.day, text: m.statement.text, moneyIn: m.statement.moneyIn, moneyOut: m.statement.moneyOut, bookDay: m.book.day, bookMemo: m.book.memo, bookKind: m.book.kind, dayGap: m.dayGap })),
    onlyStatement: r.onlyStatement.slice(0, 500),
    onlyBooks: r.onlyBooks.slice(0, 500),
    totals: r.totals,
  };
});

/**
 * monthCloseCheck { month } — Module 4g. What is still loose in a month before it is locked (closeRules.ts).
 * Read-only; the lock itself stays lockPeriod.
 */
export const monthCloseCheck = callable("monthCloseCheck", ADMIN, async (data) => {
  const month = reqMonth(data, "month");
  const db = getFirestore();
  const c = FirestoreCollections;
  const first = `${month}-01`;
  const next = `${addMonths(month, 1)}-01`;
  const [docs, locked, bookingsSnap, attSnap, heldSnap, ordersSnap, adjustSnap] = await Promise.all([
    loadDocs(),
    lockedThrough(),
    db.collection(c.BOOKINGS).where("eventDate", ">=", istAt(first, "00:00")).where("eventDate", "<", istAt(next, "00:00")).get(),
    db.collection(c.ATTENDANCE).where("date", ">=", first).where("date", "<", next).get(),
    db.collection(c.PURCHASES).where("paymentHold", "==", true).get(),
    db.collection(c.PURCHASE_ORDERS).where("status", "in", ["pendingApproval", "approved", "partReceived"]).get(),
    db.collection(c.STOCK_ADJUST_REQUESTS).where("status", "==", "pending").get(),
  ]);
  const { upTo } = splitByPeriod(allEntries(docs), first, `${month}-31`);
  const tb = trialBalance(upTo);
  const bookings = bookingsSnap.docs.map((d) => ({ id: d.id, day: dayOfValue((d.data() as Doc).eventDate), status: asStr((d.data() as Doc).status) }));
  const invoices = docs.invoices.map((i) => i.data);
  const gaps = payrollGaps(attSnap.docs.map((d) => asStr((d.data() as Doc).staffId)).filter(Boolean), docs.payroll.map((p) => p.data), month);
  const held = heldSnap.docs.map((d) => d.data() as Doc).filter((p) => p.isDeleted !== true && (dayOfValue(p.purchaseDate) ?? "") < next);
  const orders = ordersSnap.docs.map((d) => d.data() as Doc).filter((o) => asStr(o.orderDay) !== "" && asStr(o.orderDay) < next);
  const out = buildCloseChecklist({
    month,
    booksBalanced: tb.balanced,
    booksSkipped: tb.skipped,
    eventsWithoutInvoice: countEventsWithoutInvoice(bookings, invoices, month),
    draftInvoices: invoices.filter((i) => asStr(i.status) === "Draft" && i.isDeleted !== true && (dayOfValue(i.issueDate) ?? dayOfValue(i.createdAt) ?? "").slice(0, 7) === month).length,
    heldBills: held.length,
    heldBillsAmount: held.reduce((a, p) => a + Math.max(0, typeof p.totalAmount === "number" ? p.totalAmount : 0), 0),
    openOrders: orders.length,
    pendingStockAdjusts: adjustSnap.size,
    staffWithoutPayslip: gaps.withoutPayslip,
    unpaidSalaries: gaps.unpaid,
    unpaidSalariesAmount: gaps.unpaidAmount,
    lockedThrough: locked,
    previousMonth: addMonths(month, -1),
  });
  return { month, lockedThrough: locked, ended: month < todayIST().slice(0, 7), ...out };
});

/**
 * overheadShare { month, basis? } — Module 4h. The month's overheads (bills / expenses tagged "overhead" + monthly
 * salaries) shared among that month's events (overheadRules.ts). An event that is closed uses the figures fixed at
 * closing; an open one is worked out now. Read-only.
 */
export const overheadShare = callable("overheadShare", ADMIN, async (data) => {
  const month = reqMonth(data, "month");
  const basis = (OVERHEAD_BASES as readonly string[]).includes(asStr(data.basis)) ? (asStr(data.basis) as OverheadBasis) : "income";
  const db = getFirestore();
  const c = FirestoreCollections;
  const first = `${month}-01`;
  const next = `${addMonths(month, 1)}-01`;
  const [bookingsSnap, purchases, expenses, staffSnap] = await Promise.all([
    db.collection(c.BOOKINGS).where("eventDate", ">=", istAt(first, "00:00")).where("eventDate", "<", istAt(next, "00:00")).get(),
    db.collection(c.PURCHASES).where("purchaseDate", ">=", istAt(first, "00:00")).where("purchaseDate", "<", istAt(next, "00:00")).get(),
    db.collection(c.EXPENSES).where("serviceDate", ">=", istAt(first, "00:00")).where("serviceDate", "<", istAt(next, "00:00")).get(),
    db.collection(c.STAFF).where("payType", "==", "monthly").get(),
  ]);
  const costs = [...purchases.docs, ...expenses.docs]
    .map((d) => d.data() as Doc)
    .filter(isLiveRecord)
    .map((d) => ({ target: costTargetOf(d), amount: Math.max(0, asNum(d.totalAmount)) }))
    .flatMap((x) => (x.target.type === "overhead" ? [{ centre: x.target.centre as string, amount: x.amount }] : []));
  const monthlyStaff = staffSnap.docs.map((d) => ({ id: d.id, data: d.data() as Doc })).filter((s) => s.data.active !== false);
  const pay = await readPayMany(db, monthlyStaff);
  const pool = overheadPool(costs, monthlyStaff.reduce((a, s) => a + (pay.get(s.id)?.monthlySalary ?? 0), 0));
  const live = bookingsSnap.docs.filter((d) => asStr((d.data() as Doc).status) !== "Cancelled" && (d.data() as Doc).isDeleted !== true);
  const events: EventLine[] = [];
  for (const d of live.slice(0, 200)) {
    const b = d.data() as Doc;
    const closed = typeof b.closed === "object" && b.closed !== null ? (b.closed as Doc) : null;
    let income: number;
    let k: Doc;
    if (closed && typeof closed.income === "number" && typeof closed.costs === "object" && closed.costs !== null) {
      income = closed.income;
      k = closed.costs as Doc;
    } else {
      const r = await loadBookingCost(d.id);
      income = r.incomeActual;
      k = r.costActual as unknown as Doc;
    }
    const directCost = ["food", "labour", "transport", "rentals", "other"].reduce((a, f) => a + Math.max(0, asNum(k[f])), 0);
    const guests = liveSessions(b).reduce((a, s) => a + sessionGuests(s), 0) || Math.max(0, asNum(b.guestCount));
    events.push({ id: d.id, day: dayOfValue(b.eventDate) ?? "", name: asStr(b.customerNameSnapshot) || asStr(b.eventType) || d.id, income: Math.max(0, income), directCost: Math.round(directCost * 100) / 100, guests });
  }
  events.sort((a, b) => a.day.localeCompare(b.day));
  const shared = shareOverhead(pool.total, events, basis);
  return { month, basis, basisUsed: shared.basisUsed, pool, lines: shared.lines, totals: overheadTotals(shared.lines), eventCount: live.length };
});


/** ledgerExport { from, to }: every journal line of the period (date order, numbered vouchers) for CSV export. */
export const ledgerExport = callable("ledgerExport", ADMIN, async (data) => {
  const from = reqDay(data, "from");
  const to = reqDay(data, "to");
  if (from > to) fail("invalid-argument", "మొదటి తేదీ చివరి తేదీ కంటే ముందు ఉండాలి.", "The from date must not be after the to date.");
  const docs = await loadDocs();
  const { inPeriod } = splitByPeriod(allEntries(docs), from, to);
  const out = exportRows(inPeriod, (code) => {
    const a = accountOf(code);
    return { te: a?.te ?? code, en: a?.en ?? code };
  });
  return { from, to, ...out };
});
