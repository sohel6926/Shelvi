// Pending list X7–X10 (18 Nov 2026). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { expiredQty, usableStock } from "../src/stock/batchRules";
import { shouldRecompute, stockChanged } from "../src/stock/reservationRules";
import { costFigure, quotationCostKey, quotationParts, sumFigures } from "../src/costs/costRules";
import { reminderDue, reminderKey } from "../src/leads/reminderRules";
import { parsePackSale, parsePackedProduct, saleMoney, saleNumber, sellablePacks } from "../src/packed/packRules";

test("X7 expired stock: only batches whose date has passed, and it is never usable", () => {
  const b = (id: string, qty: number, expiryDay: string) => ({ id, qty, expiryDay, receivedAtMs: 0 });
  const bs = [b("a", 5, "2026-11-10"), b("b", 3, "2026-11-18"), b("c", 7, "2026-12-01"), b("d", 2, ""), b("e", 0, "2026-01-01")];
  assert.equal(expiredQty(bs, "2026-11-18"), 5, "a pack that expires today is still good today");
  assert.equal(expiredQty(bs, "2026-11-19"), 8);
  assert.equal(expiredQty([], "2026-11-19"), 0);
  assert.equal(usableStock(20, 8), 12);
  assert.equal(usableStock(5, 8), 0);
  assert.equal(usableStock(5, -3), 5);
});

test("X8 reservations are worked out again when stock changes or an hour passes", () => {
  assert.equal(stockChanged({ quantityInStock: 5 }, { quantityInStock: 30 }), true);
  assert.equal(stockChanged({ quantityInStock: 5, reservedQty: 0 }, { quantityInStock: 5, reservedQty: 4 }), false, "our own reservedQty write does not loop");
  assert.equal(stockChanged({ quantityInStock: 5 }, { quantityInStock: 5, expiredQty: 2 }), true);
  assert.equal(stockChanged(undefined, { quantityInStock: 0 }), false);
  assert.equal(stockChanged(undefined, { quantityInStock: 4 }), true);
  const hour = 3600000;
  assert.equal(shouldRecompute(true, Date.now(), Date.now()), true);
  assert.equal(shouldRecompute(false, 1000, 1000 + hour - 1), false);
  assert.equal(shouldRecompute(false, 1000, 1000 + hour), true);
});

test("X9 a quotation is costed per session with plates to cook", () => {
  assert.deepEqual(quotationParts({ menuPackageId: "m1", plates: 200, platesToCook: 205 }), [{ packageId: "m1", plates: 205 }]);
  assert.deepEqual(quotationParts({ menuPackageId: "m1", plates: 300, sessionQuotes: [{ menuPackageId: "m1", platesToCook: 105 }, { menuPackageId: "m2", plates: 200 }, { menuPackageId: "", platesToCook: 9 }] }), [{ packageId: "m1", plates: 105 }, { packageId: "m2", plates: 200 }]);
  assert.deepEqual(quotationParts({ plates: 100 }), []);
  assert.equal(quotationCostKey({ menuPackageId: "m1", platesToCook: 205, notes: "a" }), quotationCostKey({ menuPackageId: "m1", platesToCook: 205, notes: "b" }), "notes do not matter");
  assert.notEqual(quotationCostKey({ menuPackageId: "m1", platesToCook: 205 }), quotationCostKey({ menuPackageId: "m1", platesToCook: 210 }));
  assert.equal(quotationCostKey(undefined), "[]");
});

test("X9 figures of several sessions add up; one incomplete part makes the whole incomplete", () => {
  const a = costFigure({ guests: 100, lines: [{ qty: 10, rate: 50 }], labourPerPlate: 10, overheadPerPlate: 5 });
  const b = costFigure({ guests: 200, lines: [{ qty: 20, rate: 50 }, { qty: 1, rate: null }], labourPerPlate: 10, overheadPerPlate: 5 });
  const s = sumFigures([a, b]);
  assert.equal(s.guests, 300);
  assert.equal(s.food, 1500);
  assert.equal(s.total, 1500 + 3000 + 1500);
  assert.equal(s.perPlate, 20);
  assert.equal(s.complete, false);
  assert.equal(s.coveragePct, 66.7);
  assert.equal(sumFigures([a]).complete, true);
  assert.equal(sumFigures([]).complete, false);
});

test("X10 follow-up reminder: once, at the chosen time, today only, open leads only", () => {
  assert.equal(reminderKey("2026-11-20", "16:30"), "2026-11-20 16:30");
  assert.equal(reminderKey("2026-11-20", ""), "2026-11-20 09:00");
  assert.equal(reminderKey("20/11/2026", "16:30"), "");
  const lead = { status: "contacted", cancelled: false, followUpDate: "2026-11-20", followUpTime: "16:30", sentFor: "" };
  assert.equal(reminderDue(lead, "2026-11-20", "16:29"), false);
  assert.equal(reminderDue(lead, "2026-11-20", "16:30"), true);
  assert.equal(reminderDue(lead, "2026-11-20", "18:00"), true);
  assert.equal(reminderDue({ ...lead, sentFor: "2026-11-20 16:30" }, "2026-11-20", "18:00"), false, "said once");
  assert.equal(reminderDue({ ...lead, followUpTime: "17:00", sentFor: "2026-11-20 16:30" }, "2026-11-20", "18:00"), true, "moved → a new reminder");
  assert.equal(reminderDue(lead, "2026-11-21", "10:00"), false, "yesterday's date is not announced late");
  assert.equal(reminderDue({ ...lead, status: "won" }, "2026-11-20", "18:00"), false);
  assert.equal(reminderDue({ ...lead, cancelled: true }, "2026-11-20", "18:00"), false);
  assert.equal(reminderDue({ ...lead, followUpTime: "" }, "2026-11-20", "08:59"), false);
  assert.equal(reminderDue({ ...lead, followUpTime: "" }, "2026-11-20", "09:00"), true);
});

test("X5 a pack is never sold above its MRP; below is allowed", () => {
  const today = "2026-11-18";
  assert.deepEqual(parsePackSale({ packs: 3 }, 150, today), { ok: true, value: { packs: 3, pricePerPack: 150, method: "Cash", customerName: "", phone: "", saleDay: today } });
  assert.ok(parsePackSale({ packs: 3, pricePerPack: 140, method: "UPI" }, 150, today).ok);
  assert.ok(parsePackSale({ packs: 3, pricePerPack: 150 }, 150, today).ok);
  for (const bad of [{ packs: 3, pricePerPack: 150.01 }, { packs: 3, pricePerPack: 0 }, { packs: 0 }, { packs: 1.5 }, { packs: 1, method: "Cheque" }, { packs: 1, method: "Credit" }, { packs: 1, phone: "abc" }, { packs: 1, saleDay: "2026-11-19" }, { packs: 1, saleDay: "2026-11-10" }]) {
    assert.equal(parsePackSale(bad, 150, today).ok, false, JSON.stringify(bad));
  }
  assert.ok(parsePackSale({ packs: 1, method: "Credit", customerName: "Ravi", phone: "+91 99666 49469", saleDay: "2026-11-11" }, 150, today).ok);
});

test("X5 sale money: tax is split out of the price only for a GST-registered business", () => {
  assert.deepEqual(saleMoney(4, 150, 150, 12, true), { amount: 600, taxable: 535.71, cgst: 32.15, sgst: 32.14, tax: 64.29, gstRate: 12, discountFromMrp: 0 });
  assert.deepEqual(saleMoney(4, 140, 150, 12, false), { amount: 560, taxable: 560, cgst: 0, sgst: 0, tax: 0, gstRate: 0, discountFromMrp: 40 });
  assert.equal(saleMoney(1, 100, 100, 0, true).tax, 0);
  const m = saleMoney(7, 99.99, 120, 5, true);
  assert.equal(Math.round((m.taxable + m.tax) * 100), Math.round(m.amount * 100), "taxable + tax = amount");
  assert.equal(Math.round((m.cgst + m.sgst) * 100), Math.round(m.tax * 100), "cgst + sgst = tax");
});

test("X5 expired packs cannot be sold; sale numbers", () => {
  assert.equal(sellablePacks(35, 0), 35);
  assert.equal(sellablePacks(35, 10), 25);
  assert.equal(sellablePacks(5, 10), 0);
  assert.equal(saleNumber("2026-11-18", 7), "PS-261118-007");
});

test("X5 product tax fields: HSN 4–8 digits, GST 0–28, barcode letters and digits", () => {
  const base = { nameEn: "Pickle", netQty: 250, netUnit: "g", mrp: 150, shelfLifeDays: 180 };
  const r = parsePackedProduct(base);
  assert.ok(r.ok && r.value.hsn === "" && r.value.gstRate === 0 && r.value.barcode === "");
  assert.ok(parsePackedProduct({ ...base, hsn: "2001", gstRate: 12, barcode: "8901234567890" }).ok);
  for (const bad of [{ hsn: "20" }, { hsn: "20A1" }, { gstRate: 30 }, { gstRate: -1 }, { gstRate: "12" }, { barcode: "89 01" }]) assert.equal(parsePackedProduct({ ...base, ...bad }).ok, false, JSON.stringify(bad));
});
