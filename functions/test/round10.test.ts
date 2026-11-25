// Round 10 — calc-spec §20–§25 and the pure server rules around them. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../src/calc/round10";
import { CalcError } from "../src/calc/util";
import { readAdvance } from "../src/staff/advanceRules";
import { fullQuote } from "../src/menus/fullQuote";
import { describeLine, parseMenuPackage, parseQuoteRequest, parseSpecialMeals } from "../src/menus/menuPackage";
import { moneyFromQuote } from "../src/billing/invoiceLines";
import { readLunchBoxOrder, deliveriesOf } from "../src/lunchBoxes/lunchBoxRules";
import { statementEntries, statementText } from "../src/customers/statementRules";
import { chooseSendMode, resolveAtSend, templateNameFor, SERVICE_WINDOW_MS } from "../src/shared/messagePolicy";
import { templateParamOrder, templateParams } from "../src/shared/templates";
import { fixedCosts, normalizeSettings } from "../src/shared/settingsModel";
import { applySettingsPatch } from "../src/settings/settingsPatch";
import { optInStamp } from "../src/integrations/optInRules";
import { purchaseRateRows, latestRates, groceryRefs, groceryRate, rateInUnit, normUnit } from "../src/vendors/rateRules";

const adv = (id: string, amount: number, recoverMonth: string, extra: Partial<R.AdvanceIn> = {}): R.AdvanceIn => ({ id, amount, recoverMonth, date: `${recoverMonth}-01`, status: "Open", recoveries: [], ...extra });

test("§20 advances: capped at pay, oldest first, rest carries; earlier recoveries count; legacy only in its month", () => {
  const list = [adv("a", 3000, "2026-11"), adv("b", 2000, "2026-12"), adv("c", 1500, "2026-10", { date: "2026-10-05" })];
  // November: c (Oct) then a (Nov); b not due yet. Pay 4000 → c 1500 + a 2500, a carries 500.
  const nov = R.advanceRecovery(4000, list, "2026-11");
  assert.equal(nov.cut, 4000);
  assert.deepEqual(nov.takes.map((t) => [t.id, t.take, t.balanceAfter]), [["c", 1500, 0], ["a", 2500, 500]]);
  assert.equal(nov.carry, 500);
  // December, with November booked: a 500 left + b 2000; pay 10000 → all recovered
  const booked = [adv("a", 3000, "2026-11", { recoveries: [{ month: "2026-11", amount: 2500 }] }), adv("b", 2000, "2026-12"), adv("c", 1500, "2026-10", { recoveries: [{ month: "2026-11", amount: 1500 }] })];
  const dec = R.advanceRecovery(10000, booked, "2026-12");
  assert.deepEqual(dec.takes.map((t) => [t.id, t.take]), [["a", 500], ["b", 2000]]);
  assert.equal(dec.cut, 2500);
  assert.equal(dec.carry, 0);
  // re-preview of November after it was booked gives the same cut
  assert.equal(R.advanceRecovery(4000, booked, "2026-11").cut, 4000);
  // pay 0 or negative → nothing recovered, everything carries
  const none = R.advanceRecovery(-200, list, "2026-11");
  assert.equal(none.cut, 0);
  assert.equal(none.carry, 4500);
  // cancelled never; legacy only in the month of its date and never carried
  const legacy = adv("old", 1000, "2026-09", { status: "legacy", date: "2026-09-10" });
  assert.equal(R.advanceRecovery(5000, [legacy, adv("x", 99, "2026-09", { status: "Cancelled" })], "2026-09").cut, 1000);
  assert.equal(R.advanceRecovery(5000, [legacy], "2026-10").cut, 0);
  const short = R.advanceRecovery(400, [legacy], "2026-09");
  assert.deepEqual([short.cut, short.carry, short.legacyUnrecovered], [400, 0, 600]);
  assert.equal(R.nextMonth("2026-12"), "2027-01");
  assert.equal(R.nextMonth("2026-05"), "2026-06");
  assert.throws(() => R.nextMonth("2026-13"), CalcError);
  assert.deepEqual(R.advanceBalances(booked), [{ id: "a", recovered: 2500, balance: 500 }, { id: "b", recovered: 0, balance: 2000 }, { id: "c", recovered: 1500, balance: 0 }]);
  assert.deepEqual(readAdvance("z", { amount: 500, date: "2026-11-03" }), { id: "z", amount: 500, recoverMonth: "2026-11", date: "2026-11-03", status: "legacy", recoveries: [] });
  assert.equal(readAdvance("z", { amount: 500, date: "2026-11-03", status: "Cancelled" }).status, "Cancelled");
  assert.equal(readAdvance("z", { amount: 500, date: "2026-11-03", status: "Open", recoverMonth: "2026-12" }).recoverMonth, "2026-12");
});

test("§21 kids plates and special meals: lines, checks, quote totals and invoice lines", () => {
  assert.deepEqual(R.kidsSpecialLines({ plates: 100, kidsPrice: 150 }, { kidsCount: 20, specialMeals: [{ type: "jain", count: 5 }, { type: "diabetic", count: 3, extraPerPlate: 40 }] }), [
    { item: "kids", qty: 20, rate: 150, amount: 3000 },
    { item: "special:jain", qty: 5, rate: 0, amount: 0 },
    { item: "special:diabetic", qty: 3, rate: 40, amount: 120 },
  ]);
  assert.deepEqual(R.kidsSpecialLines({ plates: 100, kidsPrice: null }, {}), []);
  assert.throws(() => R.kidsSpecialLines({ plates: 100, kidsPrice: null }, { kidsCount: 2 }), CalcError);
  assert.throws(() => R.kidsSpecialLines({ plates: 10, kidsPrice: 100 }, { specialMeals: [{ type: "jain", count: 11 }] }), CalcError);
  assert.throws(() => R.kidsSpecialLines({ plates: 10, kidsPrice: 100 }, { specialMeals: [{ type: "jain", count: 1 }, { type: "jain", count: 1 }] }), CalcError);
  assert.throws(() => R.kidsSpecialLines({ plates: 10, kidsPrice: 100 }, { kidsCount: 1.5 }), CalcError);
  const pkg = { pricePerPlate: 300, minOrder: 50, servingBoy: { chargePerPerson: 500, freeRule: "none" }, freePlates: null, extras: [], replacements: [], kidsPrice: 150, nameTe: "లంచ్", nameEn: "Lunch" };
  const { pricing, meta } = parseMenuPackage(pkg);
  assert.equal(meta.kidsPrice, 150);
  assert.equal(parseMenuPackage({ ...pkg, kidsPrice: null }).meta.kidsPrice, null);
  const req = parseQuoteRequest({ plates: 100, kidsCount: 20, specialMeals: [{ type: "no-onion-garlic", count: 10, note: "పూజ" }] });
  assert.deepEqual(req.specialMeals, [{ type: "no-onion-garlic", count: 10, note: "పూజ" }]);
  const q = fullQuote(pricing, meta, { ...req, gstRate: 5 });
  assert.equal(q.subtotal, 33000);
  assert.equal(q.totals.total, 34650);
  assert.equal(q.platesToCook, 120);
  const m = moneyFromQuote(pricing, meta, req, 0);
  assert.deepEqual(m.lineItems.map((l) => [l.key, l.descriptionTe, l.amount]), [
    ["plates", "లంచ్ — ప్లేట్లు", 30000],
    ["kids", "పిల్లల ప్లేట్లు", 3000],
    ["special:no-onion-garlic", "ప్రత్యేక భోజనం: ఉల్లి, వెల్లుల్లి లేకుండా", 0],
  ]);
  assert.equal(m.totalAmount, 33000);
  assert.equal(describeLine("special:jain", meta).en, "Special meal: Jain");
  assert.throws(() => parseSpecialMeals([{ type: "vegan", count: 1 }]), CalcError);
  assert.equal(parseQuoteRequest({ plates: 10 }).kidsCount, undefined);
});

test("§22 lunch boxes: which days, month invoice from delivery ticks", () => {
  const rec = readLunchBoxOrder("o1", { days: ["Mon", "wed", "fri", "sun"], startDate: "2027-01-04", count: 25, status: "active" }, 170);
  assert.deepEqual(rec.days, ["mon", "wed", "fri", "sun"]);
  assert.equal(rec.pricePerBox, 170);
  assert.equal(R.lunchBoxesOn(rec, "2027-01-04"), 25); // Monday
  assert.equal(R.lunchBoxesOn(rec, "2027-01-05"), 0); // Tuesday
  assert.equal(R.lunchBoxesOn(rec, "2027-01-01"), 0); // before start
  assert.equal(R.lunchBoxesOn({ ...rec, status: "paused" }, "2027-01-04"), 0);
  assert.equal(R.lunchBoxesOn(readLunchBoxOrder("o2", { date: "2027-01-09", count: 40, pricePerBox: 200 }, 170), "2027-01-09"), 40);
  assert.equal(readLunchBoxOrder("o3", { date: "2027-01-09", count: 4, status: "active", isDeleted: true }, 170).status, "cancelled");
  const lines = R.lunchBoxMonthLines(
    [rec, { id: "o2", date: "2027-01-09", count: 40, pricePerBox: 200, status: "active" }],
    { o1: { "2027-01-04": 25, "2027-01-06": 24, "2027-01-08": 0, "2027-02-01": 25 }, o2: { "2027-01-09": 40 } },
    "2027-01",
  );
  assert.deepEqual(lines, [
    { orderId: "o1", boxes: 49, days: 2, rate: 170, amount: 8330 },
    { orderId: "o2", boxes: 40, days: 1, rate: 200, amount: 8000 },
  ]);
  assert.throws(() => R.lunchBoxMonthLines([rec], { o1: { "2027-01-04": 2.5 } }, "2027-01"), CalcError);
  assert.deepEqual(deliveriesOf({ deliveries: { "2027-01-04": 25, bad: 3, "2027-01-05": "x" } }), { "2027-01-04": 25 });
});

test("§23 customer statement: opening, running balance, cancellation charge, refunds", () => {
  const entries = statementEntries(
    [{ id: "b1", data: { createdAt: "2026-10-01", eventDate: "2026-11-20", status: "Cancelled" } }],
    [
      {
        id: "i1",
        data: { invoiceNumber: "INV-1", status: "Cancelled", cancellationCharge: 2000, totalAmount: 2000, issueDate: "2026-10-02", cancelledAt: "2026-11-05" },
        payments: [
          { id: "p1", data: { amount: 7000, day: "2026-10-03", method: "UPI" } },
          { id: "p2", data: { amount: -5000, day: "2026-11-05" } },
          { id: "p3", data: { amount: 999, day: "2026-10-04", status: "Cancelled" } },
        ],
      },
      { id: "i2", data: { invoiceNumber: "INV-2", status: "Sent", totalAmount: 10000, issueDate: "2026-11-01" }, payments: [] },
      { id: "i3", data: { invoiceNumber: "INV-3", status: "Void", totalAmount: 50 }, payments: [] },
    ],
  );
  const all = R.statement(entries, null, null);
  assert.deepEqual(all.lines.map((l) => [l.day, l.kind, l.amount, l.balance]), [
    ["2026-10-01", "booking", 0, 0],
    ["2026-10-03", "payment", -7000, -7000],
    ["2026-11-01", "invoice", 10000, 3000],
    ["2026-11-05", "cancellation-charge", 2000, 5000],
    ["2026-11-05", "refund", 5000, 10000],
  ]);
  assert.equal(all.closing, 10000);
  assert.equal(all.invoiced, 12000);
  assert.equal(all.paid, 2000);
  const part = R.statement(entries, "2026-11-01", "2026-11-04");
  assert.equal(part.opening, -7000);
  assert.deepEqual(part.lines.map((l) => l.balance), [3000]);
  const txt = statementText({ customer: "రమేష్", business: "Suseela Caterings", from: null, to: null, opening: 0, lines: all.lines, closing: all.closing });
  assert.ok(txt.includes("మొత్తం బాకీ: ₹10,000"));
  assert.ok(txt.includes("రద్దు చార్జీ (INV-1)"));
});

test("§24 suggested price, colour bands; purchase rates", () => {
  assert.equal(R.priceBand(null), "red");
  assert.equal(R.priceBand(14.99), "red");
  assert.equal(R.priceBand(15), "amber");
  assert.equal(R.priceBand(25), "green");
  const priced = [{ id: "rice", qty: 14, rate: 60 }, { id: "oil", qty: 5, rate: 140 }, { id: "salt", qty: 0, rate: null }];
  const s = R.packagePriceSuggestion({ guests: 100, ingredients: priced, labourPerPlate: 30, overheadPerPlate: 20, currentPrice: 200, targetMarginPct: 30 });
  assert.equal(s.foodPerPlate, 15.4); // (840 + 700) / 100; a 0-qty line is not costed
  assert.equal(s.plateCost, 65.4);
  assert.equal(s.suggestedPrice, 95); // 65.4 / 0.7 = 93.43 → ₹95
  assert.equal(s.marginPct, 67.3);
  assert.equal(s.band, "green");
  assert.deepEqual([s.costedLines, s.pricedLines, s.coveragePct], [2, 2, 100]);
  // one costed ingredient without a rate → grey "unknown", never a green from a ₹0 cost
  const u = R.packagePriceSuggestion({ guests: 100, ingredients: [...priced, { id: "saffron", qty: 0.01, rate: null }], labourPerPlate: 30, overheadPerPlate: 20, currentPrice: 200, targetMarginPct: 30 });
  assert.deepEqual([u.band, u.plateCost, u.marginPct, u.suggestedPrice, u.knownPlateCost, u.coveragePct], ["unknown", null, null, null, 65.4, 66.7]);
  assert.deepEqual(u.missingRates, ["saffron"]);
  const none = R.packagePriceSuggestion({ guests: 100, ingredients: [{ id: "a", qty: 3, rate: null }, { id: "b", qty: 2, rate: 0 }], labourPerPlate: 0, overheadPerPlate: 0, currentPrice: 300, targetMarginPct: 30 });
  assert.deepEqual([none.band, none.coveragePct, none.missingRates], ["unknown", 0, ["a", "b"]]);
  assert.deepEqual([R.packagePriceSuggestion({ guests: 10, ingredients: [], labourPerPlate: 0, overheadPerPlate: 0, currentPrice: 0, targetMarginPct: 30 }).band, R.packagePriceSuggestion({ guests: 10, ingredients: [], labourPerPlate: 0, overheadPerPlate: 0, currentPrice: 0, targetMarginPct: 30 }).coveragePct], ["unknown", null]);
  assert.equal(R.packagePriceSuggestion({ guests: 100, ingredients: [{ id: "rice", qty: 100, rate: 60 }], labourPerPlate: 0, overheadPerPlate: 0, currentPrice: 65, targetMarginPct: 30 }).band, "red"); // 7.7%
  assert.throws(() => R.packagePriceSuggestion({ guests: 0, ingredients: [], labourPerPlate: 0, overheadPerPlate: 0, currentPrice: 1, targetMarginPct: 30 }), CalcError);
  const rows = purchaseRateRows([
    { id: "p1", data: { purchaseDate: "2026-10-01", vendorId: "v1", vendorNameSnapshot: "Ravi", items: [{ inventoryItemId: "rice", description: "Rice", unit: "kg", unitPrice: 58 }] } },
    { id: "p2", data: { purchaseDate: "2026-11-01", vendorId: "v1", vendorNameSnapshot: "Ravi", items: [{ inventoryItemId: "rice", description: "Rice", unit: "kg", unitPrice: 62 }] } },
    { id: "p3", data: { purchaseDate: "2026-11-02", vendorId: "v2", vendorNameSnapshot: "Sita", items: [{ inventoryItemId: "rice", description: "Rice", unit: "kg", unitPrice: 60 }, { description: "Free", unitPrice: 0 }] } },
    { id: "p4", data: { purchaseDate: "2026-11-03", vendorId: "v3", status: "Cancelled", items: [{ inventoryItemId: "rice", unitPrice: 1 }] } },
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(latestRates(rows).get("inv:rice"), { rate: 60, day: "2026-11-02", vendorName: "Sita", unit: "kg" });
  const t = R.vendorRateTable(rows);
  assert.deepEqual(t["inv:rice"], [
    { vendorId: "v2", vendorName: "Sita", lastRate: 60, lastDay: "2026-11-02", previousRate: null, changePct: null, cheapest: true },
    { vendorId: "v1", vendorName: "Ravi", lastRate: 62, lastDay: "2026-11-01", previousRate: 58, changePct: 6.9, cheapest: false },
  ]);
});

test("§25 ratings and shifts", () => {
  assert.deepEqual(R.ratingAverage([5, 4, 4]), { avg: 4.3, count: 3 });
  assert.deepEqual(R.ratingAverage([]), { avg: null, count: 0 });
  assert.throws(() => R.ratingAverage([6]), CalcError);
  const h = 3600000;
  assert.equal(R.shiftHours(0, 9.5 * h), 9.5);
  assert.throws(() => R.shiftHours(5 * h, 5 * h), CalcError);
  assert.throws(() => R.shiftHours(0, 17 * h), CalcError);
  assert.deepEqual(R.overlaps({ start: 8 * h, end: 12 * h }, [{ id: "a", start: 6 * h, end: 8 * h }, { id: "b", start: 11 * h, end: 14 * h }]), ["b"]);
});

test("R10-8 WhatsApp: 24 h window, template from settings, held when missing", () => {
  const now = Date.parse("2026-11-05T10:00:00Z");
  const t = { duesReminder: "suseela_dues_te" };
  assert.deepEqual(chooseSendMode({ key: "customer.duesReminder", templates: t, lastInboundMs: now - 3600000, nowMs: now }), { sendAs: "text" });
  assert.deepEqual(chooseSendMode({ key: "customer.duesReminder", templates: t, lastInboundMs: now - SERVICE_WINDOW_MS, nowMs: now }), { sendAs: "template", metaTemplate: "suseela_dues_te" });
  assert.deepEqual(chooseSendMode({ key: "customer.duesReminder", templates: t, lastInboundMs: null, nowMs: now }), { sendAs: "template", metaTemplate: "suseela_dues_te" });
  assert.deepEqual(chooseSendMode({ key: "lead.followup", templates: t, lastInboundMs: null, nowMs: now }), { hold: "template-missing" });
  assert.equal(templateNameFor({ "lead.followup": "x_1" }, "lead.followup"), "x_1");
  assert.deepEqual(resolveAtSend({ holdReason: "template-missing", template: "lead.followup" }, { followup: "f_te" }), { sendAs: "template", metaTemplate: "f_te" });
  assert.deepEqual(resolveAtSend({ holdReason: "template-missing", template: "lead.followup" }, {}), { sendAs: "text" });
  assert.deepEqual(resolveAtSend({ sendAs: "template", metaTemplate: "a_b" }, {}), { sendAs: "template", metaTemplate: "a_b" });
  assert.deepEqual(templateParamOrder("customer.duesReminder"), ["name", "invoiceNumber", "balance", "upiId", "phone"]);
  assert.deepEqual(templateParams("owner.alert", { title: "T", body: "a\nb" }), ["T", "a | b"]);
  assert.equal(optInStamp({ whatsappOptIn: false }, { whatsappOptIn: true, updatedBy: "u1" })?.whatsappOptInBy, "u1");
  assert.equal(optInStamp({ whatsappOptIn: true }, { whatsappOptIn: true, updatedBy: "u1" }), null);
  assert.equal(optInStamp(undefined, { whatsappOptIn: false }), null);
  assert.equal(optInStamp(undefined, { whatsappOptIn: true, createdBy: "u2" })?.whatsappOptInBy, "u2");
  assert.equal(optInStamp({ whatsappOptIn: true }, { whatsappOptIn: false, updatedBy: "u3" })?.whatsappOptOutBy, "u3");
});

test("R10-5 settings: fixed costs, alert %, target margin, templates, lunch box price", () => {
  assert.deepEqual(fixedCosts(undefined), { fixedMonthlyCosts: 53000, fixedCostParts: { kitchenRent: 53000, other: 0 } });
  assert.deepEqual(fixedCosts({ kitchenRent: 53000, other: 12000 }), { fixedMonthlyCosts: 65000, fixedCostParts: { kitchenRent: 53000, other: 12000 } });
  assert.deepEqual(fixedCosts(40000), { fixedMonthlyCosts: 40000, fixedCostParts: { kitchenRent: 0, other: 40000 } });
  const s = normalizeSettings({ priceRiseAlertPct: 8, whatsappTemplates: { duesReminder: "d_te", bad: "" } });
  assert.equal(s.vendorPriceAlertPct, 8);
  assert.equal(normalizeSettings({ priceRiseAlertPct: 8, vendorPriceAlertPct: 3 }).vendorPriceAlertPct, 3);
  assert.equal(s.targetMarginPct, 30);
  assert.equal(s.lunchBoxPrice, 170);
  assert.deepEqual(s.whatsappTemplates, { duesReminder: "d_te" });
  assert.deepEqual(applySettingsPatch({}, { fixedMonthlyCosts: { kitchenRent: 53000, other: 5000 }, vendorPriceAlertPct: 7, targetMarginPct: 32, lunchBoxPrice: 180, whatsappTemplates: { "customer.duesReminder": "suseela_dues_te" } }).update, {
    fixedMonthlyCosts: { kitchenRent: 53000, other: 5000 },
    vendorPriceAlertPct: 7,
    priceRiseAlertPct: 7,
    targetMarginPct: 32,
    lunchBoxPrice: 180,
    whatsappTemplates: { "customer.duesReminder": "suseela_dues_te" },
  });
  assert.equal(applySettingsPatch({}, { whatsappTemplates: { x: "Bad Name" } }).errors.length, 1);
  assert.equal(applySettingsPatch({}, { fixedMonthlyCosts: { kitchenRent: -1 } }).errors.length, 1);
  assert.equal(applySettingsPatch({}, { targetMarginPct: 99 }).errors.length, 1);
});

test("R10-6 purchase lines as the web and Android forms save them → grocery items, units, vendors", () => {
  const refs = groceryRefs([
    { id: "kandi-pappu", data: { nameRoman: "Kandi Pappu", nameEn: "Toor dal", nameTe: "కంది పప్పు", unit: "kg", inventoryItemId: "demo-toordal", aliases: ["thuvar dal"] } },
    { id: "nune", data: { nameRoman: "Sunflower Oil", nameTe: "నూనె", unit: "L", inventoryItemId: "" } },
    { id: "egg", data: { nameRoman: "Kodi Guddu", nameEn: "Egg", unit: "pcs" } },
  ]);
  const purchases = [
    // web form (PurchaseFormPage): groceryItemId + inventoryItemId, unit "Kg", vendor picked from the list
    { id: "w1", data: { vendorId: "v1", vendorNameSnapshot: "Test Kirana Shop", purchaseDate: new Date("2026-11-01T06:30:00Z"), items: [{ description: "Kandi Pappu", category: "Pappulu", module: "Kirana", quantity: 5, unit: "Kg", unitPrice: 140, amount: 700, inventoryItemId: "demo-toordal", groceryItemId: "kandi-pappu" }] } },
    // Android (PurchaseRepository): no groceryItemId; typed vendor (vendorId "")
    { id: "a1", data: { vendorId: "", vendorNameSnapshot: "Ravi Traders", purchaseDate: new Date("2026-11-03T06:30:00Z"), items: [{ description: "Kandi Pappu", unit: "Gram", quantity: 500, unitPrice: 0.15, amount: 75, inventoryItemId: "demo-toordal" }] } },
    // "other" line with a name only, oil in ML; eggs by the dozen; a packet that cannot be converted
    { id: "a2", data: { vendorNameSnapshot: "Ravi Traders", purchaseDate: new Date("2026-11-04T06:30:00Z"), items: [{ description: "నూనె", unit: "ML", unitPrice: 0.18, inventoryItemId: "" }, { description: "Egg", unit: "Dozen", unitPrice: 84 }, { description: "Thuvar  Dal", unit: "Packet", unitPrice: 160 }, { description: "Paper plates", unit: "Piece", unitPrice: 2 }] } },
    { id: "x", data: { vendorNameSnapshot: "Old", status: "Cancelled", purchaseDate: new Date("2026-11-05T06:30:00Z"), items: [{ groceryItemId: "kandi-pappu", unit: "Kg", unitPrice: 1 }] } },
  ];
  const rows = purchaseRateRows(purchases, refs);
  assert.deepEqual(rows.map((r) => [r.itemKey, r.vendorName, r.rate, r.unit]), [
    ["g:kandi-pappu", "Test Kirana Shop", 140, "kg"],
    ["g:kandi-pappu", "Ravi Traders", 150, "kg"],
    ["g:nune", "Ravi Traders", 180, "L"],
    ["g:egg", "Ravi Traders", 7, "pcs"],
    ["g:kandi-pappu|packet", "Ravi Traders", 160, "Packet"],
    ["d:paper plates|piece", "Ravi Traders", 2, "Piece"],
  ]);
  const t = R.vendorRateTable(rows);
  assert.deepEqual(t["g:kandi-pappu"].map((v) => [v.vendorName, v.lastRate, v.cheapest]), [["Test Kirana Shop", 140, true], ["Ravi Traders", 150, false]]);
  assert.equal(latestRates(rows).get("g:kandi-pappu")?.rate, 150);
  assert.equal(rateInUnit(0.15, "Gram", "kg"), 150);
  assert.equal(rateInUnit(84, "Dozen", "pcs"), 7);
  assert.equal(rateInUnit(160, "Packet", "kg"), null);
  assert.equal(normUnit("Litre"), "L");
  // R10-4 unitMismatch: the latest Kandi Pappu line was a Packet → flagged, the latest Kg/Gram rate (₹150/kg) still used
  assert.deepEqual(groceryRate(rows, "kandi-pappu"), { rate: { rate: 150, day: "2026-11-03", vendorName: "Ravi Traders", unit: "kg" }, unitMismatch: true });
  assert.deepEqual(groceryRate(rows, "egg"), { rate: { rate: 7, day: "2026-11-04", vendorName: "Ravi Traders", unit: "pcs" }, unitMismatch: false });
  assert.deepEqual(groceryRate(rows, "nothing"), { rate: null, unitMismatch: false });
  const packetOnly = purchaseRateRows([{ id: "p", data: { vendorNameSnapshot: "S", purchaseDate: new Date("2026-11-04T06:30:00Z"), items: [{ groceryItemId: "egg", unit: "Tray", unitPrice: 200 }] } }], refs);
  assert.deepEqual(groceryRate(packetOnly, "egg"), { rate: null, unitMismatch: true });
  // without the grocery master the old keys still work
  assert.equal(purchaseRateRows(purchases)[0].itemKey, "inv:demo-toordal");
});
