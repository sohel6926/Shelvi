// Module 2f — packed products (MRP, label, FSSAI, batch + expiry on a packing run). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { batchNoFor, expiryFor, labelGaps, netText, parsePackRun, parsePackedProduct } from "../src/packed/packRules";

const good = { nameTe: "మామిడి ఆవకాయ", nameEn: "Mango Avakaya", netQty: 250, netUnit: "g", mrp: 149.999, shelfLifeDays: 180, ingredientsText: "Mango, mustard, chilli, salt, oil" };

test("M2f a product needs a name, net quantity, unit, MRP and shelf life", () => {
  const r = parsePackedProduct(good);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.mrp, 150, "MRP kept to 2 decimals");
  assert.equal(r.value.vegType, "veg");
  assert.equal(r.value.dateKind, "bestBefore");
  assert.equal(r.value.active, true);
  assert.equal(r.value.allergensText, "");
  for (const patch of [{ nameTe: "", nameEn: "" }, { netQty: 0 }, { netQty: "250" }, { netUnit: "gm" }, { mrp: 0 }, { mrp: -5 }, { shelfLifeDays: 0 }, { shelfLifeDays: 1.5 }, { shelfLifeDays: 2000 }, { vegType: "egg" }, { dateKind: "x" }, { ingredientsText: "x".repeat(1001) }, { active: "yes" }]) {
    assert.equal(parsePackedProduct({ ...good, ...patch }).ok, false, JSON.stringify(patch).slice(0, 40));
  }
  assert.ok(parsePackedProduct({ ...good, nameEn: "", vegType: "nonveg", dateKind: "useBy", active: false }).ok, "Telugu name alone is enough to save");
});

test("M2f expiry = packed day + shelf life; batch number from the day and run number", () => {
  assert.equal(expiryFor("2026-11-18", 180), "2027-05-17");
  assert.equal(expiryFor("2026-12-31", 1), "2027-01-01");
  assert.equal(expiryFor("2028-02-28", 2), "2028-03-01", "leap year");
  assert.equal(batchNoFor("2026-11-18", 3), "261118-03");
  assert.equal(batchNoFor("2026-11-18", 120), "261118-120");
  assert.equal(batchNoFor("2026-01-05", 0), "260105-01");
});

test("M2f a packing run: whole packs, a real day not in the future, at most 60 days back", () => {
  const today = "2026-11-18";
  assert.deepEqual(parsePackRun({ packs: 40 }, today), { ok: true, value: { packs: 40, packedDay: today, batchNo: "" } });
  assert.deepEqual(parsePackRun({ packs: 1, packedDay: "2026-11-10", batchNo: " AV-7 " }, today), { ok: true, value: { packs: 1, packedDay: "2026-11-10", batchNo: "AV-7" } });
  for (const bad of [{ packs: 0 }, { packs: 2.5 }, { packs: "4" }, { packs: 100001 }, { packs: 5, packedDay: "2026-11-19" }, { packs: 5, packedDay: "2026-09-01" }, { packs: 5, packedDay: "18-11-2026" }, { packs: 5, batchNo: "<b>" }, { packs: 5, batchNo: "x".repeat(41) }]) {
    assert.equal(parsePackRun(bad, today).ok, false, JSON.stringify(bad).slice(0, 50));
  }
  assert.ok(parsePackRun({ packs: 5, packedDay: "2026-09-19" }, today).ok, "exactly 60 days back");
});

test("M2f label reminder: what must be filled before selling, and what to check", () => {
  const biz = { name: "Suseela Caterings", address: "Hyderabad", phone: "9966649469", fssaiNumber: "1 3622 0100 00123" };
  const full = { ...good, allergensText: "Contains mustard", storageText: "Store in a cool dry place", nutritionText: "Energy 250 kcal / 100 g" };
  assert.deepEqual(labelGaps(full, biz), { must: [], check: [] });
  assert.deepEqual(labelGaps({ ...full, nameEn: "", ingredientsText: " " }, { ...biz, address: "", fssaiNumber: "12345", phone: "" }), { must: ["name", "ingredients", "makerAddress", "fssai", "phone"], check: [] });
  assert.deepEqual(labelGaps({ ...good, allergensText: "", storageText: "", nutritionText: "" }, biz).check, ["allergens", "storage", "nutrition"]);
  assert.deepEqual(labelGaps(full, { ...biz, name: "" }).must, ["makerName"]);
});

test("M2f net quantity text", () => {
  assert.equal(netText(250, "g"), "250 g");
  assert.equal(netText(0.5, "kg"), "0.5 kg");
  assert.equal(netText(12, "pcs"), "12 pcs");
});
