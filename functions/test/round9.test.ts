// Round 9 — order cancellation (calc-spec §19 money maths + pure rules). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateRefund, cancellationMoney, cancellationSummary, CANCEL_REASON_TE, CANCEL_REASONS } from "../src/calc/cancellation";
import { CalcError } from "../src/calc/util";
import * as R from "../src/events/cancelBookingRules";
import { aggregateStats, cancelMoney, readStats, sumStats } from "../src/stats/aggregate";
import { bookingCost } from "../src/stats/bookingCostCalc";

test("§19 cancellation money: refund bounds ₹0.01..paid, charge = paid − refund, round2", () => {
  assert.deepEqual(cancellationMoney(7000, "refund-all"), { refund: 7000, charge: 0 });
  assert.deepEqual(cancellationMoney(7000, "keep"), { refund: 0, charge: 7000 });
  assert.deepEqual(cancellationMoney(7000, "refund-part", 5000), { refund: 5000, charge: 2000 });
  assert.deepEqual(cancellationMoney(100.1, "refund-part", 33.333), { refund: 33.33, charge: 66.77 });
  assert.deepEqual(cancellationMoney(7000, "refund-part", 7000), { refund: 7000, charge: 0 });
  assert.deepEqual(cancellationMoney(7000, "refund-part", 0.01), { refund: 0.01, charge: 6999.99 });
  // nothing paid → no money step, whatever was chosen
  assert.deepEqual(cancellationMoney(0, undefined), { refund: 0, charge: 0 });
  assert.deepEqual(cancellationMoney(0.004, "refund-all"), { refund: 0, charge: 0 });
  assert.throws(() => cancellationMoney(7000, "refund-part", 7000.01), CalcError);
  assert.throws(() => cancellationMoney(7000, "refund-part", 0.004), CalcError);
  assert.throws(() => cancellationMoney(7000, "refund-part", 0), CalcError);
  assert.throws(() => cancellationMoney(7000, "refund-part"), CalcError);
  assert.throws(() => cancellationMoney(7000, "refund-part", Number.NaN), CalcError);
  assert.throws(() => cancellationMoney(7000, undefined), CalcError);
  assert.throws(() => cancellationMoney(-1, "keep"), CalcError);
  // charge + refund always equals what was paid
  for (const r of [0.01, 1.005, 2500.5, 6999.99]) {
    const m = cancellationMoney(7000, "refund-part", r);
    assert.equal(Math.round((m.refund + m.charge) * 100), 700000);
  }
});

test("§19 refund split over invoices (most paid first) and the reasons summary", () => {
  assert.deepEqual(allocateRefund(5000, [{ id: "a", paid: 2000 }, { id: "b", paid: 4000 }]), { b: 4000, a: 1000 });
  assert.deepEqual(allocateRefund(0, [{ id: "a", paid: 2000 }]), {});
  assert.throws(() => allocateRefund(3000.01, [{ id: "a", paid: 3000 }]), CalcError);
  const s = cancellationSummary([
    { reasonCode: "price", refund: 5000, charge: 2000 },
    { reasonCode: "price", refund: 0, charge: 1000.555 },
    { reasonCode: "other", refund: 300.1, charge: 0 },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.refunded, 5300.1);
  assert.equal(s.kept, 3000.56);
  assert.deepEqual(s.byReason.price, { count: 2, refunded: 5000, kept: 3000.56 });
  assert.equal(CANCEL_REASONS.length, 7);
  for (const r of CANCEL_REASONS) assert.ok(CANCEL_REASON_TE[r]);
});

test("Round 9 rules: refusal, equipment out / not issued, planned trips, restore", () => {
  assert.equal(R.cancelRefusal({ status: "Confirmed" }), null);
  assert.ok(R.cancelRefusal({ status: "Cancelled" }));
  assert.ok(R.cancelRefusal({ status: "Completed", closed: { at: 1 } }));
  const today = "2026-11-05";
  const moves = [
    { equipmentId: "chafing", type: "issue", qty: 10, date: "2026-11-04" },
    { equipmentId: "chafing", type: "return", qty: 10, date: "2026-11-05" },
    { equipmentId: "pot", type: "issue", qty: 4, date: "2026-11-20" },
    { equipmentId: "plates", type: "reserve", qty: 100 },
    { equipmentId: "tent", type: "issue", qty: 1, status: "planned" },
  ];
  assert.deepEqual(R.issuedOutstanding(moves, today), {});
  assert.deepEqual(moves.map((m) => R.isUnissuedMove(m, today)), [false, false, true, true, true]);
  const out = R.issuedOutstanding([...moves, { equipmentId: "pot", type: "issue", qty: 3, date: "2026-11-01" }, { equipmentId: "pot", type: "return", qty: 1, status: "Cancelled" }], today);
  assert.deepEqual(out, { pot: 3 });
  const blk = R.equipmentBlocker(out, { pot: "పెద్ద గిన్నె" });
  assert.ok(blk && blk.te.includes("పెద్ద గిన్నె 3") && blk.en.includes("return"));
  assert.equal(R.equipmentBlocker({}, {}), null);
  assert.equal(R.isPlannedTrip({ status: "planned", kmStart: 100 }), true);
  assert.equal(R.isPlannedTrip({ vehicleId: "v1" }), true);
  assert.equal(R.isPlannedTrip({ kmStart: 100, kmEnd: 150 }), false);
  assert.equal(R.isPlannedTrip({ status: "Cancelled" }), false);
  assert.equal(R.restoreRefusal({ status: "Cancelled", eventDate: "2026-11-05" }, today), null);
  assert.ok(R.restoreRefusal({ status: "Cancelled", eventDate: "2026-11-04" }, today));
  assert.ok(R.restoreRefusal({ status: "Confirmed", eventDate: "2026-12-01" }, today));
  assert.equal(R.restoreStatus({ cancel: { previousStatus: "Pending" } }), "Pending");
  assert.equal(R.restoreStatus({ previousStatus: "Completed" }), "Confirmed");
  assert.equal(R.restoreStatus({}), "Confirmed");
});

test("Round 9 texts: customer message, plan notice, summary, charge line", () => {
  const m = R.customerCancelMessage({ customer: "రమేష్", day: "2026-11-20", refund: 5000, charge: 2000, method: "UPI", business: "Suseela Caterings" });
  assert.ok(m.startsWith("నమస్కారం రమేష్ గారు,"));
  assert.ok(m.includes("20-11-2026 న మీ ఆర్డర్ రద్దు చేశాం."));
  assert.ok(m.includes("₹5,000 తిరిగి ఇస్తున్నాం (UPI)."));
  assert.ok(m.includes("₹2,000 రద్దు చార్జీగా ఉంచుకున్నాం."));
  const none = R.customerCancelMessage({ customer: "", day: null, refund: 0, charge: 0, business: "" });
  assert.ok(none.startsWith("నమస్కారం,") && !none.includes("₹"));
  assert.ok(R.cancelPlanText("రమేష్", "2026-11-20", 300).te.startsWith("వంట plan మారింది"));
  assert.deepEqual(R.cancelSummaryText({ refund: 5000, charge: 2000, staff: 3, trips: 1, moves: 0 }).te, "₹5,000 తిరిగి, ₹2,000 ఉంచుకున్నాం, 3 staff free, 1 vehicle free");
  assert.equal(R.cancelSummaryText({ refund: 0, charge: 0, staff: 0, trips: 0, moves: 0 }).en, "No money step");
  // the amount is in the line's amount column only — the name does not repeat it
  assert.deepEqual(R.chargeLine(2000), { key: "cancellation-charge", description: "Cancellation charge", descriptionTe: "రద్దు చార్జీ", quantity: 1, unitPrice: 2000, amount: 2000 });
});

test("Round 9 postpone: day change, sessions shift, notice", () => {
  assert.deepEqual(R.eventDayChange({ eventDate: "2026-11-20" }, { eventDate: "2026-11-25" }), { from: "2026-11-20", to: "2026-11-25" });
  assert.equal(R.eventDayChange({ eventDate: "2026-11-20" }, { eventDate: "2026-11-20" }), null);
  assert.equal(R.eventDayChange(undefined, { eventDate: "2026-11-20" }), null);
  assert.equal(R.eventDayChange({ eventDate: "2026-11-20" }, { eventDate: "2026-11-25", status: "Cancelled" }), null);
  assert.deepEqual(R.shiftSessions([{ id: "s1", date: "2026-11-20" }, { id: "s2", date: "2026-11-21" }, { id: "bad" }], "2026-11-20", "2026-12-01"), [{ id: "s1", date: "2026-12-01" }, { id: "s2", date: "2026-12-02" }, { id: "bad" }]);
  assert.equal(R.shiftSessions(undefined, "2026-11-20", "2026-12-01"), undefined);
  assert.ok(R.dateChangedText("రమేష్", "2026-11-20", "2026-12-01").te.includes("20-11-2026 → 01-12-2026"));
});

test("Round 9 stats: charge is income but not event revenue; cancelled event costs stay as loss", () => {
  const base = { payments: [], purchases: [{ totalAmount: 1500, costTarget: { type: "booking", bookingId: "b1" } }], expenses: [], adSpend: [], attendance: [], newBookings: [], monthlySalaries: 0, fixedCosts: null };
  const s = aggregateStats({
    ...base,
    invoices: [{ totalAmount: 10000, taxAmount: 0 }, { totalAmount: 2000, taxAmount: 0, status: "Cancelled", cancellationCharge: 2000 }],
    eventBookings: [{ status: "Confirmed" }, { status: "Cancelled" }],
    cancelledBookings: [
      { status: "Cancelled", cancel: { reasonCode: "price", refund: 5000, charge: 2000 }, cancelLoss: 300 },
      { status: "Cancelled", cancelLoss: 200.5 },
      { status: "Confirmed", cancel: { charge: 999 } }, // restored → no longer counts
    ],
  });
  assert.equal(s.eventRevenue, 10000);
  assert.equal(s.cancellationCharges, 2000);
  assert.equal(s.income, 12000);
  assert.equal(s.cancellations, 2);
  assert.equal(s.cancelRefunded, 5000);
  assert.equal(s.cancelLoss, 500.5);
  assert.equal(s.food, 1500);
  assert.equal(s.profit, 10500);
  assert.equal(s.events, 1);
  const two = sumStats([s, s], null);
  assert.equal(two.cancellationCharges, 4000);
  assert.equal(two.cancellations, 4);
  assert.equal(two.eventRevenue, 20000);
  assert.equal(two.cancelLoss, 1001);
  assert.equal(readStats({ income: 5 }).cancellationCharges, 0);
  assert.deepEqual(cancelMoney([{ status: "Cancelled", cancel: { reasonCode: "our-side", refund: 1, charge: 2 } }]).byReason, { "our-side": { count: 1, refunded: 1, kept: 2 } });
  const r = bookingCost({ bookingId: "b1", invoices: [{ totalAmount: 2000, status: "Cancelled" }], purchases: base.purchases, expenses: [], attendance: [], vehicleTrips: [], equipmentMoves: [], cancellationCharge: 2000 });
  assert.equal(r.incomeActual, 2000);
  assert.equal(r.profitActual, 500);
});

test("Round 9 cancelled invoice: only the charge line, old money in beforeCancel, restore puts it back", () => {
  const inv = {
    status: "PartiallyPaid",
    lineItems: [{ key: "menu", description: "Veg menu", descriptionTe: "వెజ్ మెనూ", quantity: 100, unitPrice: 120, amount: 12000 }],
    subtotal: 12000,
    discount: 500,
    taxable: 11500,
    gstRate: 5,
    cgstAmount: 287.5,
    sgstAmount: 287.5,
    igstAmount: 0,
    taxAmount: 575,
    totalAmount: 12075,
    amountPaid: 7000,
    balanceDue: 5075,
  };
  const c = R.cancelledInvoiceFields(inv, 2499.5);
  assert.deepEqual(c.lineItems, [R.chargeLine(2499.5)]);
  assert.equal((c.lineItems as { descriptionTe: string; amount: number }[])[0].descriptionTe, "రద్దు చార్జీ");
  assert.equal((c.lineItems as { descriptionTe: string; amount: number }[])[0].amount, 2499.5);
  for (const f of ["subtotal", "taxable", "totalAmount", "amountPaid", "cancellationCharge"]) assert.equal(c[f], 2499.5, f);
  for (const f of ["discount", "taxAmount", "cgstAmount", "sgstAmount", "igstAmount", "balanceDue"]) assert.equal(c[f], 0, f);
  assert.equal(c.status, "Cancelled");
  assert.equal(c.previousStatus, "PartiallyPaid");
  assert.deepEqual((c.beforeCancel as Record<string, unknown>).lineItems, inv.lineItems);
  assert.equal((c.beforeCancel as Record<string, unknown>).subtotal, 12000);
  // nothing kept → no lines, zeros
  const z = R.cancelledInvoiceFields(inv, 0);
  assert.deepEqual(z.lineItems, []);
  assert.equal(z.totalAmount, 0);
  assert.equal(z.subtotal, 0);
  // restore: every money field back as it was
  const stored = { ...inv, ...c };
  const back = R.restoredInvoiceMoney(stored)!;
  for (const f of ["lineItems", "subtotal", "discount", "taxable", "gstRate", "cgstAmount", "sgstAmount", "igstAmount", "taxAmount", "totalAmount"]) assert.deepEqual(back[f], (inv as Record<string, unknown>)[f], f);
  assert.equal(back.status, undefined);
  assert.equal(R.restoredInvoiceMoney({ ...inv }), null);
  assert.equal(R.restoredInvoiceMoney({ status: "Cancelled" }), null);
});
