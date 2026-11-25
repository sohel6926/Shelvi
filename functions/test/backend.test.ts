// Unit tests for the backend's pure helpers (no Firebase needed). Business maths stays in src/calc.
// Run: npm test   (compiles with tsconfig.test.json, then node --test lib-test/test/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRupees, renderTemplate, TEMPLATES } from "../src/shared/templates";
import { buildUpiPayload, isValidUpiId } from "../src/integrations/upi";
import * as D from "../src/shared/istDate";
import { aggregateStats, emptyStats, readStats, sumStats, StatsSources } from "../src/stats/aggregate";
import { dailyStaffPay, monthlyStaffPay, percentOf, rateChangePct } from "../src/calc/ops";
import { decideOutboxStatus, normalizeIndianPhone, outboxId } from "../src/shared/messagePolicy";
import { formatDocNumber } from "../src/shared/docNumber";
import { applySettingsPatch, setupProgress } from "../src/settings/settingsPatch";
import { invoiceDocTitle, issuerLine, normalizeSettings, effectiveGstRate } from "../src/shared/settingsModel";
import { checkTransport, chooseOptions, describeLine, parseMenuPackage, parseQuoteRequest } from "../src/menus/menuPackage";
import { moneyFromMenuSnapshot, moneyFromQuote, storedPaymentStatus } from "../src/billing/invoiceLines";
import { buildExportRequest, expiringFefo, isLowStock, purchaseItemKey, timelineInputFor, timelineInputInfo, timelineText, vehicleExpiries } from "../src/agents/helpers";
import { cookExtraMinutes, defaultServeTime, serviceTimeline, timelineMinutes } from "../src/calc/timeline";
import { eventStockLines } from "../src/calc/stock";
import { splitGroceryMaster } from "../src/kitchen/groceryMaster";
import { changeSummary, sameValue } from "../src/shared/historyDiff";
import { matchesHistory, pageHistory, sortHistory } from "../src/history/historyQuery";
import { shouldAutoDeduct } from "../src/stock/stockRules";
import * as R7 from "../src/calc/round7";
import { costTargetOf, isLiveRecord, parseCostTarget } from "../src/shared/costTarget";
import { appliedStock, wantedStockFromPurchase } from "../src/stock/purchaseStockRules";
import { canCancel, cancelKind, cancelledStatus, isAlreadyCancelled } from "../src/records/cancelRules";
import { billFields, billIsOpen, billOf, groupVendorDues } from "../src/vendors/billRules";
import { bookingGuestList, eventDays, readSessions, sessionAsBooking, sessionSyncUpdate } from "../src/events/sessions";
import { eventExtraLines, moneyFromQuotation, moneyFromSessionParts, withExtraLines } from "../src/billing/invoiceLines";
import { acceptedVersionUpdate, versionBump } from "../src/menus/quotationVersions";
import * as RC from "../src/calc/recipes";
import { learnedSummary, readTypedRecipe, recipeSummary, HistoryLine } from "../src/kitchen/recipeSummary";
import { planChanges, planChangedText, planInputsChanged, planLineKey, planReadyText, quotationMenuOptions, snapshotOf, tomorrowText } from "../src/kitchen/planRules";
import { menuOption } from "../src/menus/menuPackage";
import { affectedBookings, affectedDays } from "../src/stats/affected";
import { staffLinkChanges } from "../src/staff/linkLogic";
import { normalizeImportRow } from "../src/import/normalizeRow";
import { finishedMonths, monthKey } from "../src/targets/months";
import { findLeaks } from "../src/targets/leaks";
import { bookingCost } from "../src/stats/bookingCostCalc";
import { buildTemplateMessageBody, buildTextMessageBody, isConfigured, metaTemplateName } from "../src/integrations/whatsappMessages";
import { dishIdsForMenu } from "../src/kitchen/menuDishes";
import { CalcError } from "../src/calc/util";
import { invoiceAfterTotalChange, replanWithManual, splitGrossTotal } from "../src/calc/ops";
import { replan } from "../src/calc/targets";
import { readManualMonths, resolveYearTargetInputs } from "../src/targets/months";
import { importNeedsBranch, resolveBranchId } from "../src/shared/branch";
import { quotationUpdateFields } from "../src/menus/quotationUpdate";
import { canOverride, DEFAULT_CALC_MODES, normalizeCalcModes, parseManual } from "../src/shared/overridePolicy";
import { withManualTotal } from "../src/billing/invoiceLines";

const LUNCH = {
  code: "lunch-1",
  nameTe: "లంచ్ మెనూ",
  nameEn: "Lunch Menu",
  menuDate: "2025-06-28",
  groups: [[{ te: "బిర్యానీ", en: "Biryani" }, { te: "పులిహోర", en: "Pulihora" }], [{ te: "పెరుగు", en: "Curd" }]],
  pricePerPlate: 290,
  minOrder: 50,
  servingBoy: { chargePerPerson: 700, freeRule: "per50" },
  freePlates: { perPlates: 50, extraPlates: 5 },
  extras: [
    { key: "water250", te: "వాటర్ బాటిల్", en: "Water Bottle", price: 15 },
    { key: "extrasweet", te: "అదనపు స్వీట్", en: "Extra Sweet", price: null },
  ],
  replacements: [{ key: "bobbatlu", te: "బొబ్బట్టు", en: "Bobbatlu", extraPerPlate: 10 }],
  active: true,
};

test("templates: placeholders filled, missing → '-', every template renders", () => {
  assert.equal(renderTemplate("owner.alert", { title: "T", body: undefined }), "T\n-\n— Suseela CRM");
  const r = renderTemplate("customer.duesReminder", { name: "రవి", invoiceNumber: "SC-INV-2026-0001", balance: "₹5,000", upiId: "a@b", phone: "9966649469" });
  assert.match(r, /రవి గారు/);
  assert.match(r, /SC-INV-2026-0001/);
  for (const k of Object.keys(TEMPLATES)) assert.doesNotMatch(renderTemplate(k as keyof typeof TEMPLATES, {}), /\{\w+\}/);
});

test("formatRupees uses Indian grouping", () => {
  assert.equal(formatRupees(150000), "₹1,50,000");
  assert.equal(formatRupees(1234567.5), "₹12,34,567.50");
  assert.equal(formatRupees(999), "₹999");
  assert.equal(formatRupees(0.05), "₹0.05");
  assert.equal(formatRupees(-2500), "-₹2,500");
  assert.equal(formatRupees(15000000), "₹1,50,00,000");
});

test("UPI payload string", () => {
  assert.equal(
    buildUpiPayload({ upiId: "suseela@okhdfc", payeeName: "Suseela Caterings", amount: 36200, note: "SC-INV-2026-0001" }),
    "upi://pay?pa=suseela@okhdfc&pn=Suseela%20Caterings&am=36200.00&cu=INR&tn=SC-INV-2026-0001",
  );
  assert.equal(buildUpiPayload({ upiId: "suseela@okhdfc", payeeName: "S & S", amount: 10.5, note: "" }), "upi://pay?pa=suseela@okhdfc&pn=S%20%26%20S&am=10.50&cu=INR");
  assert.equal(buildUpiPayload({ upiId: "not-an-id", payeeName: "x", amount: 10, note: "" }), null);
  assert.equal(buildUpiPayload({ upiId: "a.b@ybl", payeeName: "x", amount: 0, note: "" }), null);
  assert.ok(isValidUpiId("9966649469@paytm"));
  assert.ok(!isValidUpiId("@ybl"));
});

test("IST date helpers", () => {
  assert.equal(D.istDay(new Date("2026-11-04T18:30:00Z")), "2026-11-05");
  assert.equal(D.istDay(new Date("2026-11-04T18:29:59Z")), "2026-11-04");
  assert.equal(D.istTime(new Date("2026-11-05T07:00:00Z")), "12:30");
  assert.ok(D.isValidDay("2024-02-29"));
  assert.ok(!D.isValidDay("2025-02-29"));
  assert.ok(!D.isValidDay("2025-13-01"));
  assert.ok(D.isValidMonth("2026-12") && !D.isValidMonth("2026-13"));
  assert.equal(D.dayRange("2026-11-05").start.toISOString(), "2026-11-04T18:30:00.000Z");
  assert.equal(D.dayRange("2026-11-05").end.toISOString(), "2026-11-05T18:30:00.000Z");
  assert.equal(D.monthRange("2026-12").end.toISOString(), "2026-12-31T18:30:00.000Z");
  assert.equal(D.daysInMonth("2026-02"), 28);
  assert.equal(D.daysInMonth("2028-02"), 29);
  assert.equal(D.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(D.addMonths("2026-12", 1), "2027-01");
  assert.equal(D.isoWeekday("2026-11-02"), 1);
  assert.equal(D.isoWeekday("2026-11-08"), 7);
  assert.equal(D.formatDayTe("2026-11-05"), "05-11-2026");
  const r = D.dayRange("2026-11-05");
  assert.deepEqual(D.daysBetween(r.start, D.dayRange("2026-11-07").end), ["2026-11-05", "2026-11-06", "2026-11-07"]);
  assert.deepEqual(D.monthsBetween(D.monthRange("2026-11").start, D.monthRange("2027-01").end), ["2026-11", "2026-12", "2027-01"]);
  assert.equal(D.dayOfValue({ toDate: () => new Date("2026-11-04T20:00:00Z") }), "2026-11-05");
  assert.equal(D.dayOfValue("2026-11-05"), "2026-11-05");
  assert.equal(D.dayOfValue("garbage"), null);
  assert.equal(D.dayOfValue(undefined), null);
});

function sources(over: Partial<StatsSources> = {}): StatsSources {
  return {
    invoices: [{ totalAmount: 10500, taxAmount: 500 }, { totalAmount: 5000, taxAmount: 0, status: "Cancelled" }],
    payments: [{ amount: 6000 }, { amount: -1000 }],
    purchases: [{ totalAmount: 3000 }, { totalAmount: 999, isDeleted: true }],
    expenses: [
      { section: "Temporary Staff", totalAmount: 500 },
      { section: "Staff Advance", totalAmount: 700 },
      { section: "Rent / Fixed Expense", totalAmount: 1000 },
      { section: "Transport", totalAmount: 200 },
    ],
    adSpend: [{ amount: 400, revenue: 2000, leads: 3, bookings: 1 }],
    attendance: [{ pay: 1100 }],
    eventBookings: [{ status: "Confirmed" }, { status: "Cancelled" }],
    newBookings: [{ status: "Inquiry" }],
    monthlySalaries: 600,
    fixedCosts: 0,
    ...over,
  };
}

test("stats aggregation from source docs", () => {
  const s = aggregateStats(sources());
  assert.equal(s.income, 10000); // GST is not income; cancelled invoice ignored
  assert.equal(s.collected, 5000); // refund is negative
  assert.equal(s.food, 3000);
  assert.equal(s.labour, 2200); // 1100 attendance + 500 temp staff + 600 monthly share
  assert.equal(s.other, 1200); // advances excluded
  assert.equal(s.ads, 400);
  assert.equal(s.profit, 3200);
  assert.equal(s.marginPct, 32);
  assert.equal(s.events, 1);
  assert.equal(s.bookings, 1);
  assert.equal(s.breakEven, 2381); // fixed = rent 1000; variable 5800 → 1000 / 0.42
  assert.equal(s.primeCostPct, 52);
  assert.equal(aggregateStats(sources({ fixedCosts: null })).breakEven, null);
  assert.equal(aggregateStats(sources({ fixedCosts: 53000 })).breakEven, 126190); // 53000 / 0.42
  const e = emptyStats();
  assert.equal(e.income, 0);
  assert.equal(e.marginPct, null);
  assert.equal(e.primeCostPct, null);
});

test("stats: sum of days, reading stored docs", () => {
  const a = aggregateStats(sources());
  const both = sumStats([a, a], null);
  assert.equal(both.income, 20000);
  assert.equal(both.profit, 6400);
  assert.equal(both.events, 2);
  assert.equal(both.breakEven, null);
  const r = readStats({ income: 5, profit: "x" });
  assert.equal(r.income, 5);
  assert.equal(r.profit, 0);
});

test("leaks", () => {
  const s = aggregateStats(sources({ purchases: [{ totalAmount: 5000 }], attendance: [], monthlySalaries: 1500, expenses: [{ section: "Transport", totalAmount: 2000 }], adSpend: [{ amount: 400, revenue: 100 }] }));
  // income 10000, food 5000, labour 1500, other 2000, ads 400
  const leaks = findLeaks(s);
  assert.deepEqual(leaks.map((l) => l.amount), [500, 500, 300]);
  assert.ok(leaks.every((l) => l.te && l.en));
  assert.deepEqual(findLeaks(emptyStats()), []);
});

test("§7b monthly pay and daily pay split", () => {
  const days = [
    ...Array.from({ length: 2 }, () => ({ status: "absent" as const, hours: 0 })),
    { status: "half" as const, hours: 3 },
    { status: "present" as const, hours: 10 },
    ...Array.from({ length: 20 }, () => ({ status: "present" as const, hours: 8 })),
  ];
  assert.deepEqual(monthlyStaffPay(18000, 30, days, 2000, { deductAbsences: false, freeLeaves: 0, overtime: false }), { gross: 18000, cut: 0, ot: 0, advances: 2000, net: 16000 });
  assert.deepEqual(monthlyStaffPay(18000, 30, days, 2000, { deductAbsences: true, freeLeaves: 1, overtime: true }), { gross: 18000, cut: 900, ot: 225, advances: 2000, net: 15325 });
  assert.equal(monthlyStaffPay(13000, 31, [], 20000, { deductAbsences: false, freeLeaves: 0, overtime: false }).net, -7000);
  assert.throws(() => monthlyStaffPay(-1, 30, [], 0, { deductAbsences: false, freeLeaves: 0, overtime: false }), CalcError);
  assert.deepEqual(dailyStaffPay(800, [{ hours: 8 }, { hours: 10 }, { hours: 3 }, { hours: 0 }], 500), { gross: 2000, cut: 0, ot: 300, advances: 500, net: 1800 });
  assert.equal(rateChangePct(100, 112), 12);
  assert.equal(rateChangePct(80, 70), -12.5);
  assert.equal(percentOf(50, 200), 25);
  assert.equal(percentOf(1, 0), null);
  assert.equal(percentOf(1, 3, 1), 33.3);
  assert.equal(percentOf(2, 3, 1), 66.7);
  assert.equal(percentOf(150, 100, 1), 150);
});

test("outbox policy: opt-in, approval, phones", () => {
  assert.equal(decideOutboxStatus({ audience: "customer" }), null);
  assert.equal(decideOutboxStatus({ audience: "customer", optIn: false, moneyRelated: true }), null);
  assert.equal(decideOutboxStatus({ audience: "customer", optIn: true, moneyRelated: true }), "needs-approval");
  assert.equal(decideOutboxStatus({ audience: "customer", optIn: true, firstContact: true }), "needs-approval");
  assert.equal(decideOutboxStatus({ audience: "customer", optIn: true }), "queued");
  assert.equal(decideOutboxStatus({ audience: "owner" }), "queued");
  assert.equal(decideOutboxStatus({ audience: "staff" }), "queued");
  for (const p of ["9966649469", "99666 49469", "+91 99666-49469", "09966649469", "919966649469"]) assert.equal(normalizeIndianPhone(p), "919966649469");
  assert.equal(normalizeIndianPhone("12345"), null);
  assert.equal(normalizeIndianPhone("5966649469"), null);
  assert.equal(normalizeIndianPhone(undefined), null);
  assert.equal(outboxId("dues_abc/1_2026-11-05"), "dues_abc_1_2026-11-05");
});

test("document numbers", () => {
  assert.equal(formatDocNumber("invoice", 2026, 1), "SC-INV-2026-0001");
  assert.equal(formatDocNumber("quotation", 2026, 42), "SC-Q-2026-0042");
  assert.equal(formatDocNumber("quotation", 2026, 12345), "SC-Q-2026-12345");
});

test("settings: GSTIN turns GST on with the typed rate, clearing turns it off", () => {
  const on = applySettingsPatch({}, { gstin: "36aabcu9603r1zm", gstRate: 5 });
  assert.deepEqual(on.errors, []);
  assert.deepEqual(on.update, { gstin: "36AABCU9603R1ZM", gstRegistered: true, defaultGstRate: 5 });
  assert.equal(applySettingsPatch({}, { gstin: "36AABCU9603R1ZM" }).errors.length, 1); // rate required
  assert.equal(applySettingsPatch({}, { gstin: "1234" }).errors.length, 1);
  assert.deepEqual(applySettingsPatch({ gstRegistered: true }, { gstin: "" }).update, { gstin: "", gstRegistered: false, defaultGstRate: 0 });
  assert.equal(applySettingsPatch({ gstRegistered: false }, { gstRate: 18 }).errors.length, 1);
  assert.deepEqual(applySettingsPatch({ gstRegistered: true, defaultGstRate: 5 }, { gstRate: 18 }).update, { defaultGstRate: 18 });
  assert.equal(applySettingsPatch({}, { upiId: "bad" }).errors.length, 1);
  assert.equal(applySettingsPatch({}, { bank: { name: "SBI", account: "1234567890", ifsc: "sbin0001234" } }).errors.length, 0);
  assert.equal(applySettingsPatch({}, { seasonWeights: [1, 2] }).errors.length, 1);
  assert.deepEqual(applySettingsPatch({}, { phone: " 9966649469 " }).update, { phone: "9966649469" });
  assert.deepEqual(setupProgress({ name: "Suseela", phone: "9966649469", address: "Hyd", upiId: "a@ybl" }, false), { business: true, bank: true, signature: false, staff: false, photos: false, pct: 40 });
  assert.deepEqual(setupProgress({ name: "S", phone: "1", address: "a", bank: { account: "123456", ifsc: "SBIN0001234" }, signatureUrl: "u", logoUrl: "l" }, true).pct, 100);
  assert.equal(setupProgress({ photoUrls: ["x"] }, false).photos, true);
  assert.equal(applySettingsPatch({}, { photoUrls: [1] }).errors.length, 1);
  assert.deepEqual(applySettingsPatch({}, { monthlyPayRules: { deductAbsences: true, freeLeaves: 2, overtime: false } }).update, { monthlyPayRules: { deductAbsences: true, freeLeaves: 2, overtime: false } });
});

test("settings defaults: no GST until registered", () => {
  const s = normalizeSettings({ defaultGstRate: 18 });
  assert.equal(effectiveGstRate(s), 0);
  assert.equal(invoiceDocTitle(s), "Invoice");
  const g = normalizeSettings({ gstRegistered: true, defaultGstRate: 5 });
  assert.equal(effectiveGstRate(g), 5);
  assert.equal(invoiceDocTitle(g), "Tax Invoice");
  assert.deepEqual(s.monthlyPayRules, { deductAbsences: false, freeLeaves: 0, overtime: false });
  assert.equal(s.profitMarginPct, 25);
  assert.equal(s.seasonWeights.length, 12);
  assert.equal(normalizeSettings({ phone: "1" }).ownerPhone, "1");
});

test("menu package parsing + quote → invoice money (seed lunch menu)", () => {
  const { pricing, meta } = parseMenuPackage(LUNCH);
  const req = parseQuoteRequest({ plates: 100, servingBoys: 3, transport: 1500, replacements: ["bobbatlu"], extras: [{ key: "water250", qty: 100 }, { key: "extrasweet", qty: 100, price: 25 }] });
  const m = moneyFromQuote(pricing, meta, req, 0);
  assert.equal(m.subtotal, 36200);
  assert.equal(m.totalAmount, 36200);
  assert.equal(m.taxAmount, 0);
  assert.deepEqual(m.lineItems.map((l) => l.key), ["plates", "replacement:bobbatlu", "extra:water250", "extra:extrasweet", "servingBoys", "transport"]);
  assert.equal(m.lineItems[4].quantity, 1); // 3 boys − 2 free (1 per 50 plates)
  assert.equal(m.lineItems[1].descriptionTe, "మార్పు: బొబ్బట్టు");
  const g = moneyFromQuote(pricing, meta, req, 5);
  assert.equal(g.taxAmount, 1810);
  assert.equal(g.cgstAmount + g.sgstAmount, 1810);
  assert.deepEqual(describeLine("plates", meta), { te: "లంచ్ మెనూ — ప్లేట్లు", en: "Lunch Menu — plates" });
  // transportCharged (seed transportExtra maps to it)
  assert.equal(meta.transportCharged, true);
  assert.equal(parseMenuPackage({ ...LUNCH, transportExtra: false }).meta.transportCharged, false);
  assert.equal(parseMenuPackage({ ...LUNCH, transportExtra: true, transportCharged: false }).meta.transportCharged, false);
  assert.throws(() => checkTransport(parseMenuPackage({ ...LUNCH, transportCharged: false }).meta, 500), CalcError);
  checkTransport(parseMenuPackage({ ...LUNCH, transportCharged: false }).meta, 0);
  checkTransport(meta, 500);
  // Firestore-safe group shape
  assert.equal(parseMenuPackage({ ...LUNCH, groups: [{ options: [{ te: "a", en: "A" }] }] }).meta.groups[0][0].en, "A");
});

test("menu package / quote request validation", () => {
  assert.throws(() => parseMenuPackage({ ...LUNCH, servingBoy: { chargePerPerson: 700, freeRule: "free" } }), CalcError);
  assert.throws(() => parseMenuPackage({ ...LUNCH, pricePerPlate: -1 }), CalcError);
  assert.throws(() => parseMenuPackage({ ...LUNCH, minOrder: 1.5 }), CalcError);
  assert.throws(() => parseMenuPackage({ ...LUNCH, freePlates: { perPlates: 0, extraPlates: 5 } }), CalcError);
  assert.throws(() => parseMenuPackage({ ...LUNCH, replacements: [{ key: "x", extraPerPlate: -5 }] }), CalcError);
  assert.throws(() => parseMenuPackage({ ...LUNCH, extras: [{ key: "a", price: 1 }, { key: "a", price: 2 }] }), CalcError);
  assert.throws(() => parseQuoteRequest({ plates: 10, replacements: ["a", "a"] }), CalcError);
  assert.throws(() => parseQuoteRequest({ plates: 10, extras: [{ key: "a", qty: 1 }, { key: "a", qty: 2 }] }), CalcError);
  assert.throws(() => parseQuoteRequest({ plates: "10" }), CalcError);
  assert.throws(() => parseQuoteRequest({}), CalcError);
  assert.deepEqual(parseQuoteRequest({ plates: 10 }), { plates: 10, servingBoys: 0, transport: 0, replacements: [], extras: [], discount: 0, isInterState: false });
  const { meta } = parseMenuPackage(LUNCH);
  const fsShape = parseMenuPackage({ ...LUNCH, groups: LUNCH.groups.map((g) => ({ options: g })) }).meta;
  assert.deepEqual(chooseOptions(fsShape, [1, 0]), chooseOptions(meta, [1, 0]));
  assert.deepEqual(chooseOptions(meta, [1, 0]), [{ te: "పులిహోర", en: "Pulihora" }, { te: "పెరుగు", en: "Curd" }]);
  assert.throws(() => chooseOptions(meta, [2, 0]), CalcError);
  assert.throws(() => chooseOptions(meta, [0]), CalcError);
});

test("invoice from old-style booking menuSnapshot; stored status labels", () => {
  const b = { menuSnapshot: [{ name: "Biryani", pricePerPlate: 250 }, { name: "Sweet", pricePerPlate: 40 }], guestCount: 100, discount: 1000 };
  const m = moneyFromMenuSnapshot(b, 0);
  assert.equal(m.subtotal, 29000);
  assert.equal(m.totalAmount, 28000);
  const g = moneyFromMenuSnapshot(b, 5);
  assert.deepEqual([g.taxable, g.taxAmount, g.totalAmount], [28000, 1400, 29400]);
  assert.equal(moneyFromMenuSnapshot({ ...b, guestCountConfirmed: 120 }, 0).subtotal, 34800);
  assert.throws(() => moneyFromMenuSnapshot({ ...b, guestCount: 0 }, 0), CalcError);
  assert.throws(() => moneyFromMenuSnapshot({ menuSnapshot: [] }, 0), CalcError);
  assert.equal(storedPaymentStatus("Partially Paid"), "PartiallyPaid");
  assert.equal(storedPaymentStatus("Paid"), "Paid");
});

test("§12 service timeline: lunch, order and roles", () => {
  const steps = serviceTimeline({ eventDay: "2026-11-06", serveTime: "12:00", guests: 300, mealType: "lunch", travelMinutes: 45 });
  assert.deepEqual(
    steps.map((s) => `${s.day} ${s.time} ${s.key}`),
    [
      "2026-11-05 18:00 groceryCheck",
      "2026-11-05 19:00 vesselsReady",
      "2026-11-06 06:10 prep",
      "2026-11-06 07:10 cookStart",
      "2026-11-06 10:10 load",
      "2026-11-06 10:30 leave",
      "2026-11-06 11:15 setup",
      "2026-11-06 12:00 serveStart",
      "2026-11-06 13:30 serveEnd",
      "2026-11-06 13:30 cleanup",
      "2026-11-06 14:30 leftoverEntry",
    ],
  );
  assert.deepEqual(steps.map((s) => s.role), ["manager", "manager", "cook", "cook", "helper", "driver", "helper", "all", "all", "helper", "manager"]);
  assert.ok(steps.every((s) => s.te && s.en));
  const text = timelineText(steps, "2026-11-06");
  assert.match(text, /^\(ముందు రోజు\) 18:00 — సరుకులు/);
  assert.match(text, /\n14:30 — మిగిలిన భోజనం CRM లో నమోదు$/);
});

test("§12 big early tiffin crosses midnight; cookExtra caps at 120", () => {
  assert.deepEqual([0, 250, 251, 500, 501, 1300, 5000].map((g) => cookExtraMinutes(g)), [0, 0, 30, 30, 60, 120, 120]);
  const steps = serviceTimeline({ eventDay: "2026-11-06", serveTime: "06:30", guests: 1300, mealType: "tiffin", travelMinutes: 60 });
  const byKey = Object.fromEntries(steps.map((s) => [s.key, `${s.day} ${s.time}`]));
  assert.equal(byKey.prep, "2026-11-05 23:55"); // 06:30 − 45 − 60 − 20 − (90 + 120) − 60
  assert.equal(byKey.cookStart, "2026-11-06 00:55");
  assert.equal(byKey.serveEnd, "2026-11-06 07:30"); // tiffin serves 60 min
  assert.deepEqual(steps.slice(0, 3).map((s) => s.key), ["groceryCheck", "vesselsReady", "prep"]);
  // a small tiffin at the same time stays on the day
  assert.equal(serviceTimeline({ eventDay: "2026-11-06", serveTime: "06:30", guests: 100, mealType: "tiffin", travelMinutes: 45 }).find((s) => s.key === "prep")?.time, "02:10");
});

test("§12 invalid inputs and settings overrides", () => {
  const ok = { eventDay: "2026-11-06", serveTime: "12:00", guests: 100, mealType: "lunch" as const, travelMinutes: 45 };
  for (const bad of [
    { eventDay: "2026-02-30" },
    { serveTime: "24:00" },
    { serveTime: "7:30" },
    { guests: 0 },
    { guests: 1.5 },
    { mealType: "brunch" },
    { travelMinutes: 301 },
    { travelMinutes: -1 },
  ]) {
    assert.throws(() => serviceTimeline({ ...ok, ...(bad as object) } as typeof ok), CalcError, JSON.stringify(bad));
  }
  const t = serviceTimeline({ eventDay: "2026-11-06", serveTime: "08:00", guests: 100, mealType: "tiffin", travelMinutes: 30 }, { setup: 30, cookBase: { tiffin: 60 } });
  assert.equal(t.find((s) => s.key === "prep")?.time, "04:40");
  assert.equal(timelineMinutes({ serveSpan: 120 }).serveSpan.dinner, 120);
  assert.throws(() => timelineMinutes({ setup: -5 }), CalcError);
  assert.throws(() => timelineMinutes({ foo: 1 }), CalcError);
  assert.throws(() => timelineMinutes({ cookBase: { brunch: 10 } }), CalcError);
  assert.throws(() => timelineMinutes([1]), CalcError);
  assert.equal(applySettingsPatch({}, { timelineDefaults: { setup: 999 } }).errors.length, 1);
  assert.deepEqual(applySettingsPatch({}, { timelineDefaults: { setup: 30 }, autoStockDeduct: false }).update, { timelineDefaults: { setup: 30 }, autoStockDeduct: false });
  assert.equal(normalizeSettings({}).autoStockDeduct, true);
});

test("serve time defaults and booking → timeline inputs", () => {
  assert.equal(defaultServeTime("12:00-12:30", "lunch"), "12:00");
  assert.equal(defaultServeTime(undefined, "tiffin"), "08:00");
  assert.equal(defaultServeTime("", "dinner"), "19:30");
  assert.equal(defaultServeTime(null, "lunch-dinner"), "12:00");
  assert.equal(defaultServeTime("25:00-26:00", "lunch"), "12:00");
  assert.deepEqual(timelineInputFor({ guestCount: 200, serveTime: "7:00" }, { mealType: "tiffin", deliveryWindow: "08:00-08:30" }, "2026-11-06"), { eventDay: "2026-11-06", serveTime: "08:00", guests: 200, mealType: "tiffin", travelMinutes: 45 });
  assert.deepEqual(timelineInputFor({ mealType: "dinner", serveTime: "20:15", travelMinutes: 30, guestCount: 100, guestCountActual: 150 }, undefined, "2026-11-06"), { eventDay: "2026-11-06", serveTime: "20:15", guests: 150, mealType: "dinner", travelMinutes: 30 });
  assert.equal(timelineInputFor({ guestCount: 0 }, undefined, "2026-11-06"), null);
  assert.equal(timelineInputFor({ guestCount: 10, mealType: "brunch", travelMinutes: 999 }, undefined, "2026-11-06")?.travelMinutes, 45);
  // defaultsUsed: anything not set on the booking itself
  assert.equal(timelineInputInfo({ guestCount: 100, serveTime: "12:30", travelMinutes: 30, mealType: "lunch" }, undefined, "2026-11-06")?.defaultsUsed, false);
  assert.equal(timelineInputInfo({ guestCount: 100, serveTime: "12:30", travelMinutes: 30 }, { mealType: "lunch" }, "2026-11-06")?.defaultsUsed, true);
  assert.equal(timelineInputInfo({ guestCount: 100, serveTime: "12:30", mealType: "lunch" }, undefined, "2026-11-06")?.defaultsUsed, true);
  assert.equal(timelineInputInfo({ guestCount: 100, travelMinutes: 0, mealType: "dinner" }, undefined, "2026-11-06")?.input.serveTime, "19:30");
});

test("stock: FEFO expiry list and low stock", () => {
  const items = [
    { id: "a", data: { name: "Paneer", unit: "kg", batches: [{ quantity: 2, expiryDate: "2026-11-06" }, { quantity: 3, expiryDate: "2026-11-20" }] } },
    { id: "b", data: { name: "Milk", unit: "L", quantityInStock: 5, expiryDate: "2026-11-04" } },
    { id: "c", data: { name: "Rice", unit: "kg", quantityInStock: 50 } },
  ];
  const e = expiringFefo(items, "2026-11-05", 3);
  assert.deepEqual(e.map((x) => [x.name, x.daysLeft]), [["Milk", -1], ["Paneer", 1]]);
  assert.ok(isLowStock({ quantityInStock: 2, reorderLevel: 5 }));
  assert.ok(!isLowStock({ quantityInStock: 2, reorderLevel: 0 }));
  assert.equal(purchaseItemKey({ inventoryItemId: "x", description: "Oil" }), "inv:x");
  assert.equal(purchaseItemKey({ description: " Sunflower Oil ", unit: "Litre" }), "d:sunflower oil|litre");
});

test("trigger helpers: affected days / bookings, staff link", () => {
  assert.deepEqual(affectedDays({ issueDate: "2026-11-01" }, { issueDate: { toDate: () => new Date("2026-11-03T10:00:00Z") } }, ["issueDate"]), ["2026-11-01", "2026-11-03"]);
  assert.deepEqual(affectedDays(undefined, { date: "2026-11-05" }, ["date"]), ["2026-11-05"]);
  assert.deepEqual(affectedDays({ eventDate: "2026-11-05", createdAt: "2026-11-01" }, undefined, ["eventDate", "createdAt"]), ["2026-11-01", "2026-11-05"]);
  assert.deepEqual(affectedBookings({ bookingId: "b1" }, { bookingId: "b2" }), ["b1", "b2"]);
  assert.deepEqual(affectedBookings(undefined, { bookingId: "" }), []);
  assert.deepEqual(staffLinkChanges(undefined, { linkedUserId: "u1" }), { set: "u1" });
  assert.deepEqual(staffLinkChanges({ linkedUserId: "u1" }, { linkedUserId: "u2" }), { set: "u2", clear: "u1" });
  assert.deepEqual(staffLinkChanges({ linkedUserId: "u1" }, undefined), { clear: "u1" });
  assert.deepEqual(staffLinkChanges({ linkedUserId: "u1" }, { linkedUserId: "u1" }), { set: "u1" });
  assert.deepEqual(staffLinkChanges({}, {}), {});
});

test("import rows: Telugu/English headers, phone and number checks", () => {
  const c = normalizeImportRow("customers", { "పేరు": "రవి", "ఫోన్": "99666 49469", WhatsApp: "yes" });
  assert.ok(c.ok && c.key === "9966649469" && c.doc.whatsappOptIn === true);
  assert.ok(!normalizeImportRow("customers", { name: "Ravi" }).ok);
  assert.ok(!normalizeImportRow("customers", { phone: "9966649469" }).ok);
  const s = normalizeImportRow("staff", { Name: "Lakshmi", Phone: "9876543210", "Monthly Salary": "₹18,000" });
  assert.ok(s.ok && s.doc.payType === "monthly" && s.doc.monthlySalary === 18000);
  const d = normalizeImportRow("staff", { Name: "Raju", Phone: "9876543211", "Daily Wage": 800 });
  assert.ok(d.ok && d.doc.payType === "daily" && d.doc.dailyWage === 800);
  assert.ok(!normalizeImportRow("menuItems", { name: "Pulihora", Price: "abc" }).ok);
  const m = normalizeImportRow("menuItems", { name: "Pulihora", Price: "60" });
  assert.ok(m.ok && m.key === "pulihora" && m.doc.pricePerPlate === 60);
});

test("targets: finished months", () => {
  assert.equal(finishedMonths(2026, "2026-11-05"), 10);
  assert.equal(finishedMonths(2026, "2026-01-01"), 0);
  assert.equal(finishedMonths(2025, "2026-11-05"), 12);
  assert.equal(finishedMonths(2027, "2026-11-05"), 0);
  assert.equal(monthKey(2026, 0), "2026-01");
});

test("booking cost and profit", () => {
  const r = bookingCost({
    invoices: [{ totalAmount: 36200, taxAmount: 0 }],
    purchases: [{ totalAmount: 9000 }],
    expenses: [
      { section: "Outside Purchase", totalAmount: 1000 },
      { section: "Temporary Staff", totalAmount: 2000 },
      { section: "Transport", totalAmount: 800 },
      { section: "Staff Advance", totalAmount: 5000 },
      { section: "Cleaning Department", totalAmount: 300 },
    ],
    attendance: [{ pay: 1100 }, { pay: 800 }],
    vehicleTrips: [{ fuelCost: 450 }],
    equipmentMoves: [{ rentalCost: 600, damageCost: 50 }],
  });
  assert.deepEqual(r.costActual, { food: 10000, labour: 3900, transport: 1250, rentals: 650, other: 300 });
  assert.equal(r.incomeActual, 36200);
  assert.equal(r.profitActual, 20100);
});

test("WhatsApp adapter helpers", () => {
  assert.ok(!isConfigured("none", "none"));
  assert.ok(!isConfigured(undefined, undefined));
  assert.ok(!isConfigured("EAAG123", "abc"));
  assert.ok(isConfigured("EAAG123", "1234567890"));
  assert.deepEqual(buildTextMessageBody("919966649469", "hi"), { messaging_product: "whatsapp", recipient_type: "individual", to: "919966649469", type: "text", text: { preview_url: false, body: "hi" } });
  const t = buildTemplateMessageBody("919966649469", "suseela_owner_alert", "te", ["a", "b"]) as { template: { components: { parameters: unknown[] }[] } };
  assert.equal(t.template.components[0].parameters.length, 2);
  assert.equal(metaTemplateName("owner.alert"), "suseela_owner_alert");
});

test("backup export request and menu → dishes", () => {
  assert.deepEqual(buildExportRequest("suseela-catering-crm", "suseela-catering-crm.appspot.com", "2026-11-05"), {
    url: "https://firestore.googleapis.com/v1/projects/suseela-catering-crm/databases/(default):exportDocuments",
    body: { outputUriPrefix: "gs://suseela-catering-crm.appspot.com/backups/firestore/2026-11-05" },
  });
  const ids = dishIdsForMenu([[{ te: "బిర్యానీ", en: "Biryani" }, { te: "x", en: "Unknown" }], [{ te: "", en: "", dishId: "d9" }]], [{ id: "d1", nameEn: "biryani ", nameTe: "" }]);
  assert.deepEqual(ids, ["d1", "d9"]);
});

test("manual mode maths: GST-inclusive split, invoice total vs paid, manual months, manual day pay", () => {
  assert.deepEqual(splitGrossTotal(1050, 5, false), { taxable: 1000, cgst: 25, sgst: 25, igst: 0, tax: 50, total: 1050 });
  assert.deepEqual(splitGrossTotal(1000, 5, false), { taxable: 952.38, cgst: 23.81, sgst: 23.81, igst: 0, tax: 47.62, total: 1000 });
  assert.deepEqual(splitGrossTotal(999.99, 18, true), { taxable: 847.45, cgst: 0, sgst: 0, igst: 152.54, tax: 152.54, total: 999.99 });
  assert.equal(splitGrossTotal(1000, 0, false).tax, 0);
  assert.throws(() => splitGrossTotal(-1, 0, false), CalcError);
  assert.deepEqual(invoiceAfterTotalChange(30000, 10000), { total: 30000, balanceDue: 20000, status: "PartiallyPaid" });
  assert.deepEqual(invoiceAfterTotalChange(10000, 10000), { total: 10000, balanceDue: 0, status: "Paid" });
  assert.deepEqual(invoiceAfterTotalChange(5000, 0), { total: 5000, balanceDue: 5000, status: "Unpaid" });
  assert.throws(() => invoiceAfterTotalChange(9999, 10000), CalcError); // cannot go below the amount paid
  assert.deepEqual(dailyStaffPay(800, [{ hours: 10 }, { hours: 10, manualPay: 1000 }], 0), { gross: 1800, cut: 0, ot: 300, advances: 0, net: 2100 });
  assert.throws(() => dailyStaffPay(800, [{ hours: 8, manualPay: -1 }], 0), CalcError);
  const m = moneyFromMenuSnapshot({ menuSnapshot: [{ name: "Biryani", pricePerPlate: 250 }, { name: "Sweet", pricePerPlate: 40 }], guestCount: 100, discount: 1000 }, 5);
  const w = withManualTotal(m, 30000);
  assert.deepEqual([w.taxable, w.taxAmount, w.totalAmount, w.adjustment], [28571.43, 1428.57, 30000, 600]);
  assert.equal(w.lineItems.length, 2);
});

test("manual mode rules: who may override, manual field parsing, settings", () => {
  assert.ok(canOverride("admin", false));
  assert.ok(canOverride("manager", true));
  assert.ok(!canOverride("manager", false));
  assert.ok(!canOverride("staff", true));
  assert.equal(parseManual(undefined, ["total"]), null);
  assert.deepEqual(parseManual({ total: 5000, reason: " customer bargained " }, ["total"]), { ok: true, values: { total: 5000 }, reason: "customer bargained" });
  const short = parseManual({ total: 5000, reason: "ok" }, ["total"]);
  assert.ok(short && !short.ok && /3/.test(short.error.en));
  const neg = parseManual({ total: -1, reason: "discount" }, ["total"]);
  assert.ok(neg && !neg.ok && neg.error.te.length > 0);
  assert.ok(!(parseManual({ reason: "missing value" }, ["pay"]) as { ok: boolean }).ok);
  assert.deepEqual(normalizeCalcModes(undefined), DEFAULT_CALC_MODES);
  assert.deepEqual(normalizeCalcModes({ invoice: "manual", junk: "manual", payroll: "x" }), { ...DEFAULT_CALC_MODES, invoice: "manual" });
  const s = normalizeSettings({});
  assert.equal(s.managerCanOverride, true);
  assert.deepEqual(s.calcModes, DEFAULT_CALC_MODES);
  assert.equal(normalizeSettings({ managerCanOverride: false }).managerCanOverride, false);
  assert.deepEqual(applySettingsPatch({ calcModes: { quotation: "manual" } }, { calcModes: { invoice: "manual" } }).update, { calcModes: { ...DEFAULT_CALC_MODES, quotation: "manual", invoice: "manual" } });
  assert.equal(applySettingsPatch({}, { calcModes: { invoice: "sometimes" } }).errors.length, 1);
  assert.equal(applySettingsPatch({}, { calcModes: { profit: "manual" } }).errors.length, 1);
  assert.deepEqual(applySettingsPatch({}, { managerCanOverride: false }).update, { managerCanOverride: false });
  assert.equal(applySettingsPatch({}, { managerCanOverride: "no" }).errors.length, 1);
});

test("§4b year plan with typed months (null = automatic)", () => {
  const W = Array.from({ length: 12 }, () => 1);
  const N = Array.from({ length: 12 }, () => null as number | null);
  // all null = §4 replan, every month automatic with autoValue = revised
  const SEASON = [8, 9, 7, 6, 8, 4, 3, 4, 6, 9, 11, 10];
  const actuals = [1300000, 1000000.5, 700000];
  const all = replanWithManual(15000000, SEASON, actuals, N);
  const ref = replan(15000000, SEASON, actuals);
  assert.deepEqual(all.months.map((m) => m.revised), ref.months.map((m) => m.revised));
  assert.equal(all.aheadOrBehind, ref.aheadOrBehind);
  assert.ok(all.months.every((m) => m.calcMode === "auto" && m.autoValue === m.revised));
  // January typed: the other 11 months share 1200 − 300 by weight
  const jan = replanWithManual(1200, W, [], [300, ...N.slice(1)]);
  assert.deepEqual(jan.months.map((m) => m.revised), [300, 82, 82, 82, 82, 82, 82, 82, 82, 82, 81, 81]);
  assert.deepEqual([jan.months[0].calcMode, jan.months[0].autoValue, jan.months[1].calcMode, jan.months[1].autoValue], ["manual", 100, "auto", 100]);
  assert.equal(jan.months.reduce((a, m) => a + m.revised, 0), 1200);
  // finished months: automatic ones keep the rounded actual, a typed finished month stays typed
  const fin = replanWithManual(1200, W, [150.4, 90], [null, 200, ...N.slice(2)]);
  assert.deepEqual(fin.months.slice(0, 3).map((m) => [m.revised, m.isActual, m.calcMode]), [[150, true, "auto"], [200, false, "manual"], [85, false, "auto"]]);
  assert.equal(fin.months.reduce((a, m) => a + m.revised, 0), 1200);
  assert.ok(Math.abs(fin.aheadOrBehind - 40.4) < 1e-9); // §4 aheadOrBehind is not rounded
  // typed more than the year target: automatic months get 0, never negative
  assert.ok(replanWithManual(1200, W, [], [2000, ...N.slice(1)]).months.slice(1).every((m) => m.revised === 0));
  // every month typed
  const full = replanWithManual(1200, W, [], Array.from({ length: 12 }, () => 50));
  assert.ok(full.months.every((m) => m.revised === 50 && m.calcMode === "manual"));
  assert.throws(() => replanWithManual(1200, W, [], [1, 2]), CalcError);
  assert.throws(() => replanWithManual(1200, W, [], [10.5, ...N.slice(1)]), CalcError);
  assert.throws(() => replanWithManual(1200, W, [], [-1, ...N.slice(1)]), CalcError);
  // stored manualMonths read back safely
  assert.deepEqual(readManualMonths([5, null, "x", -1, 2.5]), [5, null, null, null, null, null, null, null, null, null, null, null]);
  assert.deepEqual(readManualMonths(undefined), N);
});

test("contract audit fixes: branch stamp, quotation update keeps unsent fields, year target inputs", () => {
  assert.equal(resolveBranchId("b2", "b1"), "b2");
  assert.equal(resolveBranchId(undefined, "b1"), "b1");
  assert.equal(resolveBranchId("  ", ""), null);
  assert.equal(resolveBranchId(null, ""), null);
  assert.ok(importNeedsBranch("staff"));
  assert.ok(!importNeedsBranch("customers") && !importNeedsBranch("vendors") && !importNeedsBranch("menuItems"));
  assert.ok(importNeedsBranch("leads")); // Module 1c: leads are listed per branch

  const fields = { totalAmount: 100, notes: "", bookingId: "", validDays: 15, validUntil: "x", issueDate: "t", docTitle: "Invoice" };
  assert.deepEqual(quotationUpdateFields(fields, { notes: false, validDays: false, bookingId: false }), { totalAmount: 100, docTitle: "Invoice" });
  assert.deepEqual(quotationUpdateFields(fields, { notes: true, validDays: true, bookingId: true }), { totalAmount: 100, notes: "", bookingId: "", validDays: 15, validUntil: "x", docTitle: "Invoice" });

  const N = Array.from({ length: 12 }, () => null as number | null);
  const typed = [500, ...N.slice(1)];
  const defaults = { profitMarginPct: 25, seasonWeights: Array.from({ length: 12 }, () => 1) };
  const stored = { profitMarginPct: 30, weights: Array.from({ length: 12 }, (_, i) => i + 1), manualMonths: typed };
  // nothing sent → the year's stored values
  assert.deepEqual(resolveYearTargetInputs({}, stored, defaults), { profitMarginPct: 30, weights: stored.weights, manualMonths: typed, manualMonthsSent: false });
  // new year → settings
  assert.deepEqual(resolveYearTargetInputs({}, null, defaults), { profitMarginPct: 25, weights: defaults.seasonWeights, manualMonths: N, manualMonthsSent: false });
  // sent values win; 12 nulls = fully automatic
  const r = resolveYearTargetInputs({ profitMarginPct: 20, manualMonths: N }, stored, defaults);
  assert.deepEqual([r.profitMarginPct, r.weights, r.manualMonths, r.manualMonthsSent], [20, stored.weights, N, true]);
  // stored doc without weights → settings weights
  assert.deepEqual(resolveYearTargetInputs({}, { ...stored, weights: null }, defaults).weights, defaults.seasonWeights);
});

test("event stock lines: §6 quantities, shared stock, shortBy, skipped, manual", () => {
  const groceries = [
    { groceryItemId: "rice", inventoryItemId: "inv1", nameTe: "బియ్యం", nameEn: "Rice", unit: "kg", per100: 10 },
    { groceryItemId: "oil", inventoryItemId: "inv2", nameTe: "నూనె", nameEn: "Oil", unit: "L", per100: 2 },
    { groceryItemId: "salt", inventoryItemId: "inv1", nameTe: "ఉప్పు", nameEn: "Salt", unit: "kg", per100: 0.5 },
    { groceryItemId: "leaf", inventoryItemId: "", nameTe: "ఆకు", nameEn: "Leaf", unit: "pcs", per100: 100 },
    { groceryItemId: "ghee", inventoryItemId: "inv3", nameTe: "నెయ్యి", nameEn: "Ghee", unit: "kg", per100: 1 },
    { groceryItemId: "milk", inventoryItemId: "inv2", nameTe: "పాలు", nameEn: "Milk", unit: "g", per100: 1 },
  ];
  const r = eventStockLines(groceries, "wedding", 200, { inv1: 15, inv2: 10 });
  assert.deepEqual(r.items.map((i) => [i.groceryItemId, i.quantity, i.autoValue, i.deducted, i.shortBy]), [
    ["rice", 21, 21, 15, 6],
    ["oil", 4.5, 4.5, 4.5, 0],
    ["salt", 1.5, 1.5, 0, 1.5], // rice already used all of inv1
  ]);
  assert.deepEqual(r.skipped.map((x) => [x.groceryItemId, x.reason]), [["leaf", "not-linked"], ["ghee", "no-stock-item"], ["milk", "bad-unit"]]);
  const m = eventStockLines(groceries, "wedding", 200, { inv1: 100, inv2: 10 }, { oil: 3 });
  assert.deepEqual(m.items.find((i) => i.groceryItemId === "oil"), { groceryItemId: "oil", nameTe: "నూనె", nameEn: "Oil", inventoryItemId: "inv2", unit: "L", category: "", group: "", quantity: 3, autoValue: 4.5, shortBy: 0, deducted: 3 });
  assert.throws(() => eventStockLines(groceries, "wedding", 200, {}, { nope: 1 }), CalcError);
  assert.throws(() => eventStockLines(groceries, "wedding", 200, {}, { oil: -1 }), CalcError);
  assert.equal(eventStockLines(groceries, "annadanam", 200, { inv1: 0, inv2: 0 }).items[0].shortBy, 25.5); // 10 × 1.2 × 2 × 1.05 = 25.2 → 25.5
});

test("automatic stock deduction trigger rule", () => {
  assert.ok(shouldAutoDeduct({ status: "Confirmed" }, { status: "Completed" }, true));
  assert.ok(!shouldAutoDeduct({ status: "Confirmed" }, { status: "Completed" }, false));
  assert.ok(!shouldAutoDeduct({ status: "Completed" }, { status: "Completed" }, true));
  assert.ok(!shouldAutoDeduct({ status: "Confirmed" }, { status: "Completed", stockDeduction: { reversed: false } }, true));
  assert.ok(shouldAutoDeduct({ status: "Cancelled" }, { status: "Completed", stockDeduction: { reversed: true } }, true));
  assert.ok(shouldAutoDeduct(undefined, { status: "Completed" }, true));
  assert.ok(!shouldAutoDeduct({ status: "Confirmed" }, undefined, true));
});

test("change history: diff, who, ignored fields", () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  assert.deepEqual(changeSummary(undefined, { guestCount: 250, createdBy: "u1", updatedAt: ts(1) }), {
    action: "create",
    changed: ["createdBy", "guestCount"],
    diff: { createdBy: { before: null, after: "u1" }, guestCount: { before: null, after: 250 } },
    by: "u1",
  });
  const long = "x".repeat(201);
  const u = changeSummary({ guestCount: 250, notes: "a", menu: [1], when: ts(5), updatedBy: "u1", updatedAt: ts(1) }, { guestCount: 300, notes: long, menu: [1, 2], when: ts(5), updatedBy: "u2", updatedAt: ts(2) });
  assert.deepEqual(u?.changed, ["guestCount", "menu", "notes", "updatedBy"]);
  assert.deepEqual(u?.diff, { guestCount: { before: 250, after: 300 }, updatedBy: { before: "u1", after: "u2" } });
  assert.equal(u?.by, "u2");
  assert.equal(changeSummary({ a: 1, updatedAt: ts(1) }, { a: 1, updatedAt: ts(2), lastUpdated: ts(3) }), null);
  assert.equal(changeSummary({ a: 1 }, { a: 2 })?.by, "system");
  const d = changeSummary({ a: true, updatedBy: "u3" }, undefined);
  assert.deepEqual([d?.action, d?.by, d?.diff], ["delete", "u3", { a: { before: true, after: null }, updatedBy: { before: "u3", after: null } }]);
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${String(i).padStart(2, "0")}`, i]));
  const big = changeSummary(undefined, many);
  assert.equal(big?.changed.length, 30);
  assert.equal(Object.keys(big?.diff ?? {}).length, 20);
  assert.ok(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }));
  assert.ok(!sameValue({ a: [1] }, { a: [1, 2] }));
});

test("history paging and filters", () => {
  const e = (id: string, atMs: number, data: Record<string, unknown>) => ({ id, atMs, data });
  const all = sortHistory([e("a", 1, { collection: "bookings", docId: "b1", by: "u1" }), e("b", 3, { collection: "invoices", docId: "i1", uid: "u2" }), e("c", 2, { collection: "bookings", docId: "b1", by: "u2" }), e("d", 3, { collection: "bookings", docId: "b2" })]);
  assert.deepEqual(all.map((x) => x.id), ["d", "b", "c", "a"]);
  const p1 = pageHistory(all, 2);
  assert.deepEqual([p1.page.map((x) => x.id), p1.nextCursor], [["d", "b"], "b"]);
  const p2 = pageHistory(all, 2, "b");
  assert.deepEqual([p2.page.map((x) => x.id), p2.nextCursor], [["c", "a"], null]);
  assert.deepEqual(all.filter((x) => matchesHistory(x, { collection: "bookings", by: "u2" })).map((x) => x.id), ["c"]);
  assert.deepEqual(all.filter((x) => matchesHistory(x, { by: "u2" })).map((x) => x.id), ["b", "c"]); // older entries use uid
  assert.deepEqual(all.filter((x) => matchesHistory(x, { by: "system" })).map((x) => x.id), ["d"]);
  assert.deepEqual(all.filter((x) => matchesHistory(x, { fromMs: 2, toMsExcl: 3 })).map((x) => x.id), ["c"]);
});

test("grocery master: only per100 > 0 items, extra fields tolerated, category/group per line", () => {
  const docs = [
    { id: "rice", data: { nameTe: "బియ్యం", nameEn: "Rice", unit: "kg", per100: 10, inventoryItemId: "inv1", module: "Kirana", group: "Biyyam / Rice", nameRoman: "Biyyam", purchaseUnits: ["Kg", "Bag"] } },
    { id: "jeera", data: { nameTe: "జీలకర్ర", nameRoman: "Jeelakarra", unit: "kg", per100: null, module: "Kirana", group: "Popu Dinusulu", purchaseUnits: ["Kg", "Gram"] } },
    { id: "salt", data: { nameTe: "ఉప్పు", unit: "kg", module: "Kirana" } },
    { id: "zero", data: { nameTe: "సున్నా", unit: "kg", per100: 0 } },
    { id: "neg", data: { nameTe: "తప్పు", unit: "kg", per100: -2 } },
    { id: "gram", data: { nameTe: "గ్రాము", unit: "Gram", per100: 5 } },
    { id: "oil", data: { nameTe: "నూనె", nameEn: "Oil", unit: "L", per100: 2, category: "Oils", group: "Noonelu" } },
  ];
  const r = splitGroceryMaster(docs);
  assert.deepEqual(r.usable.map((u) => [u.groceryItemId, u.category, u.group, u.per100]), [["rice", "Kirana", "Biyyam / Rice", 10], ["oil", "Oils", "Noonelu", 2]]);
  assert.equal(r.skippedNoPer100, 4);
  assert.equal(r.skippedBadUnit, 1);
  assert.equal(splitGroceryMaster([{ id: "x", data: { nameRoman: "Pesalu", unit: "kg", per100: 1 } }]).usable[0].nameEn, "Pesalu");
  // the same lines feed event stock deduction, with category/group carried through
  const lines = eventStockLines(r.usable, "wedding", 100, { inv1: 50 });
  assert.deepEqual(lines.items.map((i) => [i.groceryItemId, i.category, i.group, i.quantity]), [["rice", "Kirana", "Biyyam / Rice", 10.5]]);
  assert.deepEqual(lines.skipped.map((s) => [s.groceryItemId, s.reason]), [["oil", "not-linked"]]);
});

test("R7 calc: extra plates, outside orders, equipment, trips", () => {
  assert.deepEqual(R7.extraPlates(320, 300, 290), { qty: 20, amount: 5800 });
  assert.deepEqual(R7.extraPlates(250, 300, 290), { qty: 0, amount: 0 });
  assert.throws(() => R7.extraPlates(10.5, 300, 290), CalcError);
  assert.deepEqual(R7.outsideOrderAmounts({ acceptedQty: 480, rate: 6.5, advancePaid: 1000, paid: 500 }), { cost: 3120, amountDue: 1620 });
  assert.equal(R7.outsideOrderAmounts({ acceptedQty: 100, rate: 5, advancePaid: 1000, paid: 0 }).amountDue, -500); // vendor owes us
  R7.checkOutsideDelivery({ deliveredQty: 500, acceptedQty: 480, returnedQty: 20 });
  assert.throws(() => R7.checkOutsideDelivery({ deliveredQty: 500, acceptedQty: 490, returnedQty: 20 }), CalcError);
  assert.deepEqual(R7.equipmentOutstanding([
    { equipmentId: "pot", type: "issue", qty: 10 },
    { equipmentId: "pot", type: "return", qty: 7 },
    { equipmentId: "pot", type: "damaged", qty: 1 },
    { equipmentId: "plate", type: "issue", qty: 200 },
    { equipmentId: "plate", type: "lost", qty: 5 },
    { equipmentId: "plate", type: "return", qty: 200 },
  ]), { pot: 2, plate: 0 });
  assert.throws(() => R7.equipmentOutstanding([{ equipmentId: "x", type: "borrow", qty: 1 }]), CalcError);
  assert.equal(R7.rentalCost(20, 15, 2), 600);
  assert.throws(() => R7.rentalCost(1, 1, 0), CalcError);
  assert.equal(R7.tripCost({ fuelCost: 500, ratePerKm: 12, kmStart: 1000, kmEnd: 1040 }), 980);
  assert.throws(() => R7.tripCost({ fuelCost: 0, ratePerKm: 0, kmStart: 10, kmEnd: 5 }), CalcError);
});

test("R7 calc: bill status, legacy mapping, purchase stock delta, sessions", () => {
  assert.deepEqual(R7.billPaymentStatus(1000, 0), { paid: 0, balance: 1000, paymentStatus: "Unpaid" });
  assert.deepEqual(R7.billPaymentStatus(1000, 400), { paid: 400, balance: 600, paymentStatus: "PartiallyPaid" });
  assert.deepEqual(R7.billPaymentStatus(1000, 1000), { paid: 1000, balance: 0, paymentStatus: "Paid" });
  assert.deepEqual(R7.mapLegacyPaymentStatus("Fully Paid", 900, 0), { paid: 900, cancelled: false });
  assert.deepEqual(R7.mapLegacyPaymentStatus("Settled", 900, 0), { paid: 900, cancelled: false });
  assert.deepEqual(R7.mapLegacyPaymentStatus("Advance Paid", 900, 300), { paid: 300, cancelled: false });
  assert.deepEqual(R7.mapLegacyPaymentStatus("Partial", 900, 0), { paid: 0, cancelled: false });
  assert.deepEqual(R7.mapLegacyPaymentStatus("Credit", 900, 0), { paid: 0, cancelled: false });
  assert.deepEqual(R7.mapLegacyPaymentStatus("Cancelled", 900, 0), { paid: 0, cancelled: true });
  assert.deepEqual(R7.purchaseStockDelta({ a: 10, b: 5 }, { a: 4, c: 2 }), { a: 6, b: 5, c: -2 });
  assert.deepEqual(R7.purchaseStockDelta({ a: 10 }, { a: 10 }), {});
  const t = R7.sessionTotals([
    { date: "2026-11-21", serveTime: "19:30", guests: 300 },
    { date: "2026-11-21", serveTime: "12:00", guests: 250, guestCountActual: 270 },
    { date: "2026-11-20", serveTime: "19:00", guests: 100, status: "cancelled" },
  ]);
  assert.deepEqual(t, { guestCount: 550, date: "2026-11-21", serveTime: "12:00", guestCountActual: 570 });
  assert.equal(R7.sessionTotals([{ date: "2026-11-21", guests: 10 }]).guestCountActual, null);
});

test("R7 close blockers", () => {
  const ok = { vesselsOutstanding: 0, outsideOrdersOpen: 0, pendingExtras: 0, staffWithoutAttendance: [], customerBalance: 0, vendorBillsEntered: true };
  assert.deepEqual(R7.closeBlockers(ok), []);
  const all = R7.closeBlockers({ vesselsOutstanding: 3, outsideOrdersOpen: 1, pendingExtras: 2, staffWithoutAttendance: ["s1"], customerBalance: 5000, vendorBillsEntered: false });
  assert.deepEqual(all.map((b) => b.code), ["vessels", "outsideOrders", "extras", "attendance", "customerBalance", "vendorBills"]);
  assert.ok(all.every((b) => b.te && b.en));
  assert.deepEqual(R7.closeBlockers({ ...ok, customerBalance: 5000, overrideReason: "customer will pay next week" }), []);
  assert.deepEqual(R7.closeBlockers({ ...ok, customerBalance: 5000, overrideReason: "ok" }).map((b) => b.code), ["customerBalance"]);
});

test("R7 cost target, live records, purchase stock lines, cancel rules, issuer line", () => {
  assert.deepEqual(costTargetOf({}), { type: "overhead", centre: "general" });
  assert.deepEqual(costTargetOf({ bookingId: "b1" }), { type: "booking", bookingId: "b1" });
  assert.deepEqual(costTargetOf({ bookingId: "b1", costTarget: { type: "overhead", centre: "marketing" } }), { type: "overhead", centre: "marketing" });
  assert.deepEqual(costTargetOf({ costTarget: { type: "booking", bookingId: "b2", sessionId: "s1" } }), { type: "booking", bookingId: "b2", sessionId: "s1" });
  assert.deepEqual(costTargetOf({ costTarget: { type: "overhead", centre: "parties" } }), { type: "overhead", centre: "general" });
  assert.equal(parseCostTarget({ type: "overhead", centre: "parties" }), null);
  assert.equal(parseCostTarget({ type: "booking", bookingId: "" }), null);
  assert.ok(isLiveRecord({ status: "Paid" }) && !isLiveRecord({ status: "Cancelled" }) && !isLiveRecord({ archived: true }) && !isLiveRecord({ isDeleted: true }) && !isLiveRecord({ status: "cancelled" }));
  const purchase = { items: [{ inventoryItemId: "rice", quantity: 25 }, { inventoryItemId: "rice", quantity: 5 }, { inventoryItemId: "", quantity: 3 }, { inventoryItemId: "oil", quantity: 0 }] };
  assert.deepEqual(wantedStockFromPurchase(purchase), { rice: 30 });
  assert.deepEqual(wantedStockFromPurchase({ ...purchase, status: "Cancelled" }), {});
  assert.deepEqual(appliedStock({ stockApplied: { rice: 30 } }, undefined), { rice: 30 });
  assert.deepEqual(appliedStock({ items: [] }, purchase), { rice: 30 }); // old purchase: its previous lines were already in stock
  assert.deepEqual(appliedStock({ items: [] }, undefined), {});
  assert.equal(cancelKind("bookings"), "transactional");
  assert.equal(cancelKind("vendors"), "master");
  assert.equal(cancelKind("users"), null);
  assert.ok(canCancel("admin", "invoices") && canCancel("manager", "purchases") && !canCancel("manager", "invoices") && !canCancel("staff", "leads"));
  assert.equal(cancelledStatus("outsideOrders"), "cancelled");
  assert.ok(isAlreadyCancelled({ archived: true }) && !isAlreadyCancelled({ status: "Draft" }));
  assert.equal(issuerLine(normalizeSettings({ name: "Suseela Caterings" })), "Suseela Caterings");
  assert.equal(issuerLine(normalizeSettings({ brandName: "Suseela Caterings", legalNameOnDocs: true })), "Suseela Caterings (a brand of Suseela Technologies Private Limited)");
});

test("R7 stats: cancelled excluded, outside orders as food, overhead by centre", () => {
  const s = aggregateStats({
    invoices: [{ totalAmount: 10000, taxAmount: 0 }],
    payments: [{ amount: 3000 }, { amount: 2000, status: "Cancelled" }],
    purchases: [{ totalAmount: 1000 }, { totalAmount: 500, costTarget: { type: "booking", bookingId: "b1" } }, { totalAmount: 900, status: "Cancelled" }],
    expenses: [{ section: "Utility Bill", totalAmount: 400, costTarget: { type: "overhead", centre: "utilities" } }, { section: "Transport", totalAmount: 300, bookingId: "b1" }],
    adSpend: [{ amount: 100, status: "Cancelled" }],
    attendance: [{ pay: 800 }, { pay: 800, status: "Cancelled" }],
    eventBookings: [],
    newBookings: [],
    monthlySalaries: 0,
    fixedCosts: null,
    outsideOrders: [{ acceptedQty: 100, rate: 6, costTarget: { type: "booking", bookingId: "b1" } }, { acceptedQty: 50, rate: 6, status: "cancelled" }],
  });
  assert.equal(s.collected, 3000);
  assert.equal(s.food, 2100); // 1000 + 500 + outside 600
  assert.equal(s.labour, 800);
  assert.equal(s.ads, 0);
  assert.deepEqual(s.overheadByCentre, { general: 1000, utilities: 400 });
  const both = sumStats([s, s], null);
  assert.deepEqual(both.overheadByCentre, { general: 2000, utilities: 800 });
  assert.deepEqual(readStats({ overheadByCentre: { general: 5, bad: "x" } }).overheadByCentre, { general: 5 });
});

test("R7 booking cost: tagged costs only, outside orders, rented equipment, trips", () => {
  const r = bookingCost({
    bookingId: "b1",
    invoices: [{ totalAmount: 50000, taxAmount: 0 }],
    purchases: [{ totalAmount: 9000, costTarget: { type: "booking", bookingId: "b1" } }, { totalAmount: 7000, bookingId: "b1", costTarget: { type: "overhead", centre: "general" } }, { totalAmount: 1000, bookingId: "b1", status: "Cancelled" }],
    expenses: [{ section: "Transport", totalAmount: 500, bookingId: "b1" }],
    attendance: [{ pay: 1000 }],
    vehicleTrips: [{ fuelCost: 300, ratePerKm: 10, kmStart: 100, kmEnd: 150 }],
    equipmentMoves: [{ equipmentId: "chafing", type: "issue", qty: 10, days: 2 }, { equipmentId: "pot", type: "issue", qty: 5 }, { equipmentId: "chafing", type: "return", qty: 10 }],
    outsideOrders: [{ acceptedQty: 400, rate: 7, costTarget: { type: "booking", bookingId: "b1" } }],
    equipment: { chafing: { kind: "rented", rentalRate: 50 }, pot: { kind: "own" } },
  });
  assert.deepEqual(r.costActual, { food: 11800, labour: 1000, transport: 1300, rentals: 1000, other: 0 });
  assert.equal(r.profitActual, 50000 - 11800 - 1000 - 1300 - 1000);
});

test("R7-8 bills: one vocabulary, legacy statuses, outside orders, vendor dues", () => {
  assert.deepEqual(billOf("purchases", { totalAmount: 5000, paymentStatus: "Paid" }), { total: 5000, paidTotal: 5000, balance: 0, paymentStatus: "Paid", paidField: 5000 });
  assert.deepEqual(billOf("expenses", { totalAmount: 1200, paymentStatus: "Advance Paid", advancePaid: 500 }).paymentStatus, "PartiallyPaid");
  assert.equal(billOf("expenses", { totalAmount: 1200, paid: 1200, paymentStatus: "Unpaid" }).paymentStatus, "Paid"); // numeric paid wins
  const oo = billOf("outsideOrders", { acceptedQty: 480, rate: 6.5, advancePaid: 1000, paid: 500 });
  assert.deepEqual([oo.total, oo.paidTotal, oo.balance, oo.amountDue, oo.paymentStatus], [3120, 1500, 1620, 1620, "PartiallyPaid"]);
  assert.deepEqual(billFields("purchases", { totalAmount: 900, paymentStatus: "Pending" }), { paid: 0, balance: 900, paymentStatus: "Unpaid", legacyPaymentStatus: "Pending" });
  assert.ok(!billIsOpen("outsideOrders", { status: "ordered", acceptedQty: 0, rate: 5, orderedQty: 100 }));
  assert.ok(!billIsOpen("purchases", { totalAmount: 900, status: "Cancelled" }));
  const dues = groupVendorDues([
    { collection: "purchases", doc: { vendorId: "v1", vendorNameSnapshot: "Ravi Kirana", totalAmount: 5000, paid: 2000, purchaseDate: "2026-11-01" } },
    { collection: "purchases", doc: { vendorId: "v1", vendorNameSnapshot: "Ravi Kirana", totalAmount: 1000, paid: 0, purchaseDate: "2026-10-20" } },
    { collection: "purchases", doc: { vendorId: "v1", totalAmount: 800, paid: 800 } },
    { collection: "expenses", doc: { personName: "Lakshmi Tent House", totalAmount: 3000, paymentStatus: "Unpaid", serviceDate: "2026-11-03" } },
    { collection: "outsideOrders", doc: { vendorName: "Pulka Anna", status: "delivered", acceptedQty: 400, rate: 7, advancePaid: 500, date: "2026-11-04" } },
  ]);
  assert.deepEqual(dues.map((d) => [d.vendorName, d.bills, d.outstanding, d.oldestDueDate]), [
    ["Ravi Kirana", 2, 4000, "2026-10-20"],
    ["Lakshmi Tent House", 1, 3000, "2026-11-03"],
    ["Pulka Anna", 1, 2300, "2026-11-04"],
  ]);
});

test("vendor dues: a bill held for a price mismatch is listed and counted as held", () => {
  const dues = groupVendorDues([
    { collection: "purchases", doc: { vendorId: "v1", vendorNameSnapshot: "Sri Kirana", totalAmount: 2250, paid: 0, paymentHold: true, purchaseDate: "2026-11-20" } },
    { collection: "purchases", doc: { vendorId: "v1", vendorNameSnapshot: "Sri Kirana", totalAmount: 500, paid: 100, purchaseDate: "2026-11-18" } },
  ]);
  assert.deepEqual(dues.map((d) => [d.outstanding, d.heldAmount, d.heldBills]), [[2650, 2250, 1]]);
});

test("R7-4 vehicle papers: 30 / 7 days before and expired", () => {
  const v = [
    { id: "v1", data: { number: "TS09AB1234", insuranceExpiry: "2026-12-05", fitnessExpiry: "2026-11-12", pollutionExpiry: "2026-11-01", driverLicenseExpiry: "2027-05-01" } },
    { id: "v2", data: { number: "TS09CD5678", insuranceExpiry: "2026-11-06", archived: false } },
    { id: "v3", data: { number: "OLD", insuranceExpiry: "2026-11-01", archived: true } },
  ];
  const r = vehicleExpiries(v, "2026-11-05");
  assert.deepEqual(r.alertNow.map((x) => [x.number, x.field, x.daysLeft]), [["TS09AB1234", "pollutionExpiry", -4], ["TS09AB1234", "fitnessExpiry", 7], ["TS09AB1234", "insuranceExpiry", 30]]);
  assert.deepEqual(r.soon.map((x) => [x.number, x.field]), [["TS09AB1234", "pollutionExpiry"], ["TS09CD5678", "insuranceExpiry"], ["TS09AB1234", "fitnessExpiry"]]);
});

test("R7-5 sessions: read, sync totals, guests per session, event days", () => {
  const booking = {
    guestCount: 0,
    eventTypeCode: "wedding",
    sessions: [
      { id: "s1", nameTe: "పెళ్లి భోజనం", nameEn: "Wedding lunch", date: "2026-11-21", serveTime: "12:30", mealType: "lunch", packageId: "lunch-1", guests: 500, guestCountActual: 540 },
      { id: "s2", nameEn: "Reception dinner", date: "2026-11-21", serveTime: "19:30", mealType: "dinner", guests: 300, guestCountConfirmed: 320 },
      { id: "s0", nameEn: "Haldi tiffin", date: "2026-11-20", serveTime: "08:00", guests: 80, status: "cancelled" },
      { id: "bad", date: "2026-02-30", guests: 10 },
    ],
  };
  assert.deepEqual(readSessions(booking).map((s) => s.id), ["s1", "s2", "s0"]);
  const u = sessionSyncUpdate(booking);
  assert.equal(u?.guestCount, 800);
  assert.equal((u?.eventDate as Date).toISOString(), D.istAt("2026-11-21", "12:30").toISOString());
  assert.equal(u?.guestCountActual, 540 + 320);
  assert.equal(sessionSyncUpdate({ ...booking, guestCount: 800, guestCountActual: 860, eventDate: D.istAt("2026-11-21", "12:30") }), null);
  assert.equal(sessionSyncUpdate({ guestCount: 5 }), null);
  assert.deepEqual(bookingGuestList(booking, 0), [540, 320]);
  assert.deepEqual(bookingGuestList({ guestCount: 200 }, 200), [200]);
  assert.deepEqual(eventDays(booking), ["2026-11-21"]);
  const sb = sessionAsBooking(readSessions(booking)[1], booking);
  assert.deepEqual([sb.guestCount, sb.guestCountConfirmed, sb.serveTime, sb.mealType], [300, 320, "19:30", "dinner"]);
  assert.equal(D.istAt("2026-11-21", "7:30").toISOString(), D.istNoon("2026-11-21").toISOString());
  // stock: Σ of each session's §6 quantity
  const g = [{ groceryItemId: "rice", inventoryItemId: "inv1", nameTe: "", nameEn: "Rice", unit: "kg", per100: 10 }];
  assert.equal(eventStockLines(g, "wedding", [540, 320], { inv1: 1000 }).items[0].autoValue, 57 + 34); // 56.7 → 57, 33.6 → 34
});

test("R7-5 / R7-7 invoice: sessions in one quotation, extras and extra plates", () => {
  const menu = (price: number) => parseMenuPackage({ ...LUNCH, pricePerPlate: price, freePlates: null, servingBoy: { chargePerPerson: 700, freeRule: "none" } });
  const m1 = menu(290);
  const m2 = menu(150);
  const req = (plates: number, discount = 0) => parseQuoteRequest({ plates, discount });
  const money = moneyFromSessionParts([
    { sessionId: "s1", label: { te: "భోజనం", en: "Lunch" }, pricing: m1.pricing, meta: m1.meta, req: req(500, 1000) },
    { sessionId: "s2", label: { te: "విందు", en: "Dinner" }, pricing: m2.pricing, meta: m2.meta, req: req(300) },
  ], 5);
  assert.equal(money.subtotal, 145000 + 45000);
  assert.equal(money.discount, 1000);
  assert.equal(money.taxable, 189000);
  assert.equal(money.totalAmount, 198450);
  assert.deepEqual(money.lineItems.map((l) => l.key), ["s1:plates", "s2:plates"]);
  assert.match(money.lineItems[0].description, /^Lunch — /);
  const quotation = {
    sessionQuotes: [
      { sessionId: "s1", sessionNameTe: "భోజనం", sessionNameEn: "Lunch", quoteInput: req(500, 1000), pricingSnapshot: { ...m1.pricing, nameTe: "", nameEn: "Lunch Menu" } },
      { sessionId: "s2", sessionNameTe: "విందు", sessionNameEn: "Dinner", quoteInput: req(300), pricingSnapshot: { ...m2.pricing, nameTe: "", nameEn: "Dinner Menu" } },
    ],
  };
  assert.equal(moneyFromQuotation(quotation, 5).totalAmount, 198450);
  const booking = { sessions: [{ id: "s1", nameEn: "Lunch", date: "2026-11-21", guests: 500, guestCountActual: 520 }, { id: "s2", nameEn: "Dinner", date: "2026-11-21", guests: 300, guestCountActual: 290 }] };
  const extras = [
    { id: "e1", data: { status: "approved", item: "Ice cream", qty: 100, rate: 15, sessionId: "s2" } },
    { id: "e2", data: { status: "pending", item: "Paan", qty: 50, rate: 20 } },
  ];
  const lines = eventExtraLines(quotation, booking, extras);
  assert.deepEqual(lines.map((l) => [l.key, l.quantity, l.unitPrice, l.amount]), [["s1:extraPlates", 20, 290, 5800], ["eventExtra:e1", 100, 15, 1500]]);
  const withX = withExtraLines(money, lines);
  assert.equal(withX.subtotal, 190000 + 7300);
  assert.equal(withX.totalAmount, 206115); // (197300 − 1000) × 1.05
  // single-menu quotation: booking-level guestCountActual
  const single = { quoteInput: req(300), pricingSnapshot: { pricePerPlate: 290 } };
  assert.deepEqual(eventExtraLines(single, { guestCountActual: 310 }, []).map((l) => [l.key, l.quantity, l.amount]), [["extraPlates", 10, 2900]]);
  assert.deepEqual(eventExtraLines(undefined, { guestCountActual: 310 }, []), []);
});

test("R7-10 quotation versions", () => {
  assert.deepEqual(versionBump({ status: "Draft", version: 1 }), { version: 1, snapshotVersion: null, status: null });
  assert.deepEqual(versionBump({ status: "Sent", version: 2 }), { version: 3, snapshotVersion: 2, status: "Draft" });
  assert.deepEqual(versionBump({ status: "Accepted" }), { version: 2, snapshotVersion: 1, status: "Draft" });
  assert.equal(acceptedVersionUpdate({ status: "Sent", version: 3 }, { status: "Accepted", version: 3 }), 3);
  assert.equal(acceptedVersionUpdate({ status: "Accepted", version: 3, acceptedVersion: 3 }, { status: "Accepted", version: 3, acceptedVersion: 3 }), null);
  assert.equal(acceptedVersionUpdate({ status: "Sent" }, { status: "Sent" }), null);
  assert.equal(acceptedVersionUpdate(undefined, { status: "Accepted" }), 1);
});

test("§13 bands, eaten per 100, pieces, status, band ratio (ties → smaller band)", () => {
  assert.deepEqual([1, 150, 151, 400, 401, 800, 801].map(RC.sizeBand), ["S", "S", "M", "M", "L", "L", "XL"]);
  assert.throws(() => RC.sizeBand(0), CalcError);
  assert.equal(RC.eatenPer100({ guests: 200, cooked: 37, leftover: 3 }), 17);
  assert.throws(() => RC.eatenPer100({ guests: 0, cooked: 10, leftover: 0 }), CalcError);
  assert.throws(() => RC.eatenPer100({ guests: 10, cooked: 10, leftover: 11 }), CalcError);
  assert.throws(() => RC.eatenPer100({ guests: 10, cooked: 0, leftover: 0 }), CalcError);
  assert.equal(RC.piecePer100(3), 300);
  assert.deepEqual(RC.learnStatus(0).status, "none");
  assert.deepEqual([RC.learnStatus(3).status, RC.learnStatus(3).te], ["learning", "నేర్చుకుంటోంది 3/5"]);
  assert.equal(RC.learnStatus(5).te, "నేర్చుకున్నది ✓");
  const ev = [
    { eaten: 10, band: "S" as const }, { eaten: 12, band: "S" as const },
    { eaten: 8, band: "L" as const }, { eaten: 8, band: "L" as const },
    { eaten: 15, band: "M" as const },
  ];
  assert.equal(RC.bandPer100(ev, "S"), 11);
  assert.equal(RC.bandPer100(ev, "M"), 11); // S and L both one step away → the smaller band (S)
  assert.equal(RC.bandPer100(ev, "XL"), 8);
  assert.equal(RC.bandPer100([], "S"), null);
  assert.equal(RC.bandPer100([{ eaten: 10, band: "S" }, { eaten: 20, band: "L" }], "M"), 15); // no band with 2 → overall
});

test("§13.5 per100 fallback order: piece → exact cell → factors (clamped, typed factor) → typed rule → base → none", () => {
  const target = { band: "M" as const, style: "banthi", comboKey: "flavoured-rice" };
  const e = (eaten: number, band: "S" | "M" | "L" | "XL", style: string, comboKey: string) => ({ eaten, band, style, comboKey });
  assert.deepEqual(RC.per100ForPlan({ events: [], target, piecesPerPlate: 3 }).per100, 300);
  const cell = RC.per100ForPlan({ events: [e(14, "M", "banthi", "flavoured-rice"), e(16, "M", "banthi", "flavoured-rice"), e(30, "L", "buffet", "bread")], target });
  assert.deepEqual([cell.source, cell.per100, cell.matchedEvents], ["cell", 15, 2]);
  const ev = [e(14, "M", "banthi", "bread+flavoured-rice"), e(20, "M", "buffet", "flavoured-rice"), e(18, "L", "banthi", "flavoured-rice"), e(12, "L", "buffet", "bread+flavoured-rice")];
  const f = RC.per100ForPlan({ events: ev, target });
  assert.equal(f.source, "factors");
  assert.ok(Math.abs((f.per100 as number) - 16 * (17 / 16) * 1 * (19 / 16)) < 1e-9);
  assert.deepEqual(f.factors, { band: 17 / 16, style: 1, combo: 19 / 16 });
  assert.ok(f.why.length >= 3 && f.why.every((w) => w.te && w.en));
  // clamping: a group 3× the average is capped at +50%
  const big = RC.per100ForPlan({ events: [e(5, "S", "x", "a"), e(5, "S", "x", "a"), e(60, "XL", "y", "b"), e(60, "XL", "y", "b")], target: { band: "XL", style: "z", comboKey: "c" } });
  assert.equal(big.factors.band, 1.5);
  const small = RC.per100ForPlan({ events: [e(5, "S", "x", "a"), e(5, "S", "x", "a"), e(60, "XL", "y", "b"), e(60, "XL", "y", "b")], target: { band: "S", style: "z", comboKey: "c" } });
  assert.equal(small.factors.band, 0.5);
  // typed starting factor when the group has < 2 events
  const typedF = RC.per100ForPlan({ events: [e(16, "M", "banthi", "x")], target: { band: "M", style: "buffet", comboKey: "x" }, startRules: [{ style: "buffet", factorPct: 10 }] });
  assert.equal(typedF.factors.style, 1.1);
  assert.ok(Math.abs((typedF.per100 as number) - 17.6) < 1e-9);
  // no events: typed per100 style+combo → combo → style → basePer100 → none
  const rules = [{ style: "banthi", per100: 20 }, { comboKey: "flavoured-rice", per100: 15 }, { style: "banthi", comboKey: "flavoured-rice", per100: 18 }];
  assert.equal(RC.per100ForPlan({ events: [], target, startRules: rules }).per100, 18);
  assert.equal(RC.per100ForPlan({ events: [], target, startRules: rules.slice(0, 2) }).per100, 15);
  assert.equal(RC.per100ForPlan({ events: [], target, startRules: rules.slice(0, 1) }).per100, 20);
  assert.equal(RC.per100ForPlan({ events: [], target, startRules: [{ style: "banthi", per100: 20, band: "XL" }] }).per100, null); // band must match
  assert.deepEqual(RC.per100ForPlan({ events: [], target, basePer100: 17 }).per100, 17);
  const none = RC.per100ForPlan({ events: [], target });
  assert.deepEqual([none.per100, none.source, none.why[0].te], [null, "none", "ఇంకా నేర్చుకోలేదు"]);
});

test("§13.5 comboKey, roles, service style", () => {
  assert.equal(RC.comboKey(["flavoured-rice", "bread", "side"]), "bread+flavoured-rice");
  assert.equal(RC.comboKey(["rice", "bread", "sweet"]), "bread+rice");
  assert.equal(RC.comboKey(["flavoured-rice", "flavoured-rice", "bread", "rice"]), "bread+flavoured-rice×2+rice");
  assert.equal(RC.comboKey(["side"]), "");
  assert.deepEqual(["rice", "roti-bread", "tiffin", "dal", "snack", "other"].map(RC.roleOfCategory), ["rice", "bread", "tiffin-main", "side", "starter", "other"]);
  assert.deepEqual(["wedding", "annadanam", "office", "other"].map(RC.defaultServiceStyle), ["banthi", "banthi", "buffet", "buffet"]);
});

test("§13.2 ingredient ratios (typed blend while n < 3), rounding, shared batch split", () => {
  const evs = [{ cooked: 20, ingredients: { rice: 2.4 } }, { cooked: 30, ingredients: { rice: 3.3 } }];
  assert.ok(Math.abs(RC.ingredientRatios(evs).rice.perUnit - 0.114) < 1e-12);
  const blended = RC.ingredientRatios(evs, { rice: 0.1, salt: 0.01 });
  assert.ok(Math.abs(blended.rice.perUnit - 8.2 / 75) < 1e-12);
  assert.ok(Math.abs(blended.salt.perUnit - 0.25 / 75) < 1e-12);
  assert.deepEqual(RC.ingredientRatios([], { rice: 0.1 }), { rice: { perUnit: 0.1, eventsUsed: 0 } });
  const three = [...evs, { cooked: 50, ingredients: { rice: 5 } }];
  assert.ok(Math.abs(RC.ingredientRatios(three, { rice: 1 }).rice.perUnit - 10.7 / 100) < 1e-12); // n ≥ 3: typed ignored
  assert.throws(() => RC.ingredientRatios([{ cooked: 10, ingredients: { rice: -1 } }]), CalcError);
  assert.deepEqual([RC.roundUpQty(2.31, "kg"), RC.roundUpQty(2.3, "L"), RC.roundUpQty(3, "pcs"), RC.roundUpQty(2.01, "pcs")], [2.4, 2.3, 3, 3]);
  const sp = RC.splitShared({ cooked: 50, leftover: 5, ingredients: { rice: 6 } }, [{ key: "A", guests: 120 }, { key: "B", guests: 200 }, { key: "C", guests: 180 }]);
  assert.deepEqual(sp.B, { cooked: 20, leftover: 2, ingredients: { rice: 2.4 } });
  const odd = RC.splitShared({ cooked: 10, leftover: 1, ingredients: {} }, [{ key: "A", guests: 1 }, { key: "B", guests: 1 }, { key: "C", guests: 1 }]);
  assert.deepEqual([odd.A.cooked, odd.B.cooked, odd.C.cooked], [3.34, 3.33, 3.33]); // remainder → largest (first on ties)
  const big = RC.splitShared({ cooked: 10, leftover: 0, ingredients: {} }, [{ key: "A", guests: 100 }, { key: "B", guests: 200 }]);
  assert.deepEqual([big.A.cooked, big.B.cooked], [3.33, 6.67]);
  assert.throws(() => RC.splitShared({ cooked: 10, leftover: 0, ingredients: {} }, [{ key: "A", guests: 0 }]), CalcError);
  assert.throws(() => RC.splitShared({ cooked: 10, leftover: 0, ingredients: {} }, [{ key: "A", guests: 1 }, { key: "A", guests: 2 }]), CalcError);
  assert.throws(() => RC.splitShared({ cooked: 10, leftover: 11, ingredients: {} }, [{ key: "A", guests: 1 }]), CalcError);
});

test("Round 8 menu options: pieces from names, dish links, no undefined fields", () => {
  assert.equal(RC.piecesFromName("ఇడ్లీ – 3"), 3);
  assert.equal(RC.piecesFromName("Pulka - 2"), 2);
  assert.equal(RC.piecesFromName("సాంబార్"), null);
  assert.equal(RC.piecesFromName("Biryani – 50"), null);
  assert.deepEqual(menuOption({ te: "ఇడ్లీ – 3", en: "Idli – 3" }), { te: "ఇడ్లీ – 3", en: "Idli – 3", piecesPerPlate: 3 });
  assert.deepEqual(menuOption({ te: "పుల్కా", en: "Pulka", dishId: "pulka", variantId: "2pc", piecesPerPlate: 2 }), { te: "పుల్కా", en: "Pulka", dishId: "pulka", variantId: "2pc", piecesPerPlate: 2 });
  assert.deepEqual(menuOption({ te: "పెరుగు", en: "Curd" }), { te: "పెరుగు", en: "Curd" });
});

test("Round 8 learned / recipe summaries", () => {
  const line = (guests: number, cooked: number, leftover: number, style: string, combo: string, at: number, rice = 0): HistoryLine => ({ variantId: "", guests, cooked, leftover, band: RC.sizeBand(guests), serviceStyle: style, comboKey: combo, ingredients: rice ? { rice } : {}, eventAtMs: at });
  const lines = [line(120, 22, 2, "banthi", "flavoured-rice", 1, 2.6), line(200, 37, 3, "banthi", "flavoured-rice", 2, 4.4), line(180, 33, 3, "buffet", "flavoured-rice", 3, 3.9)];
  const l = learnedSummary(lines, 18);
  assert.equal(l.status, "learning");
  assert.equal(l.eventsUsed, 3);
  assert.ok(Math.abs((l.per100 as number) - (50 / 3 + 17 + 50 / 3) / 3) < 1e-9);
  assert.equal((l.byBand as Record<string, { events: number }>).M.events, 2);
  assert.equal(Object.keys(l.byCell as object).length, 3);
  assert.ok("flavoured-rice" in (l.factors as { combo: object }).combo);
  assert.equal(l.advice, "cut"); // learned ~16.8 vs starting 18 → −7%
  assert.equal(learnedSummary([], 18).per100, 18);
  assert.equal(learnedSummary([], null).per100, null);
  const r = recipeSummary(lines, readTypedRecipe([{ groceryItemId: "rice", perUnit: 0.12 }]));
  assert.ok(Math.abs((r.ingredients as { perUnit: number }[])[0].perUnit - 10.9 / 92) < 1e-12);
  assert.deepEqual(readTypedRecipe({ rice: 0.12, bad: -1 }), { rice: 0.12 });
});

test("Round 8 plan rules: inputs changed, old → new, notification texts", () => {
  assert.ok(planInputsChanged(undefined, { guestCount: 1 }));
  assert.ok(!planInputsChanged({ guestCount: 100, planSnapshot: 1 }, { guestCount: 100, planSnapshot: 2, updatedBy: "x" }));
  assert.ok(planInputsChanged({ guestCount: 100 }, { guestCount: 120 }));
  assert.ok(planInputsChanged({ sessions: [{ id: "s1", guests: 10 }] }, { sessions: [{ id: "s1", guests: 12 }] }));
  const lines = [
    { key: planLineKey("", "pulihora", ""), dishId: "pulihora", variantId: "", nameTe: "పులిహోర", nameEn: "Pulihora", unit: "kg", qty: 41 },
    { key: planLineKey("s1", "pulka", "2pc"), dishId: "pulka", variantId: "2pc", nameTe: "పుల్కా", nameEn: "Pulka", unit: "pcs", qty: 630 },
    { key: planLineKey("", "x", ""), dishId: "x", variantId: "", nameTe: "x", nameEn: "x", unit: "kg", qty: null },
  ];
  assert.deepEqual(snapshotOf(lines), { "-|pulihora|-": 41, "s1|pulka|2pc": 630 });
  const ch = planChanges({ "-|pulihora|-": 38, "s1|pulka|2pc": 630, "-|gone|-": 5 }, lines);
  assert.deepEqual(ch.map((c) => [c.key, c.old, c.now]), [["-|pulihora|-", 38, 41], ["-|gone|-", 5, null]]); // unchanged lines are not listed
  assert.match(planChangedText("రమేష్", ch).te, /పులిహోర 38 kg → 41 kg/);
  assert.match(planReadyText("రమేష్", "2026-11-21", lines).te, /^వంట plan సిద్ధం: రమేష్/);
  assert.match(tomorrowText(2, [{ nameTe: "పులావ్", nameEn: "Pulao", unit: "kg", total: 41 }]).te, /^రేపటి వంట plan సిద్ధం: 2 events, పులావ్ 41 kg/);
  const q = { sessionQuotes: [{ sessionId: "s1", menuChoices: [{ te: "పుల్కా", en: "Pulka", dishId: "pulka" }, { te: "పెరుగు", en: "Curd" }] }], menuChoices: [{ te: "a", en: "a", dishId: "d1" }] };
  assert.deepEqual(quotationMenuOptions(q, "s1").map((o) => o.dishId), ["pulka"]);
  assert.deepEqual(quotationMenuOptions({ menuChoices: [{ te: "a", en: "a", dishId: "d1" }] }, "").map((o) => o.dishId), ["d1"]);
  assert.deepEqual(quotationMenuOptions(undefined, ""), []);
});
