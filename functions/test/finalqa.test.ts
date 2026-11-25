// Final QA fixes: purchase stock in the stock item's unit (F4), invoice terms (b). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appliedStock, purchaseStockLines, stockSkippedText, wantedStockFromPurchase } from "../src/stock/purchaseStockRules";
import { purchaseStockDelta } from "../src/calc/round7";
import { qtyInUnit, unitFactor, isBaseUnit } from "../src/shared/units";
import { DEFAULT_INVOICE_TERMS, normalizeSettings } from "../src/shared/settingsModel";
import { applySettingsPatch } from "../src/settings/settingsPatch";

const units = { toordal: "kg", oil: "Litre", egg: "pcs", rice: "Kg", ghee: "kg" };
const line = (inventoryItemId: string, quantity: number, unit: string, description = inventoryItemId) => ({ inventoryItemId, quantity, unit, description });

/** What the trigger does: delta between wanted and stored stockApplied, then the new stockApplied. */
function applyOnce(current: Record<string, unknown> | undefined, previous: Record<string, unknown> | undefined) {
  const applied = appliedStock(current, previous);
  const { wanted, skipped } = purchaseStockLines(current, units);
  const delta = purchaseStockDelta(wanted, applied);
  const next: Record<string, number> = { ...applied };
  for (const [k, d] of Object.entries(delta)) {
    next[k] = Math.round(((next[k] ?? 0) + d) * 100) / 100;
    if (next[k] === 0) delete next[k];
  }
  return { delta, next, skipped };
}

test("F4 units: gram, ml, dozen convert; packet does not", () => {
  assert.equal(qtyInUnit(500, "Gram", "kg"), 0.5);
  assert.equal(qtyInUnit(750, "ML", "Litre"), 0.75);
  assert.equal(qtyInUnit(2, "Dozen", "pcs"), 24);
  assert.equal(qtyInUnit(3, "Kg", "kg"), 3);
  assert.equal(qtyInUnit(2, "Packet", "kg"), null);
  assert.equal(qtyInUnit(2, "Packet", "Packet"), 2);
  assert.equal(unitFactor("kg", "g"), 1000);
  assert.ok(isBaseUnit("Kg") && isBaseUnit("") && !isBaseUnit("Gram"));
});

test("F4 purchase stock: converted into the stock unit; packet skipped and listed", () => {
  const p = { purchaseNumber: "PUR-1", items: [line("toordal", 500, "Gram", "Kandi Pappu"), line("oil", 750, "ML"), line("egg", 2, "Dozen"), line("rice", 25, "Kg"), line("ghee", 2, "Packet", "Ghee"), line("rice", 500, "Gram")] };
  const r = purchaseStockLines(p, units);
  assert.deepEqual(r.wanted, { toordal: 0.5, oil: 0.75, egg: 24, rice: 25.5 });
  assert.equal(r.skipped.length, 1);
  assert.deepEqual([r.skipped[0].line, r.skipped[0].inventoryItemId, r.skipped[0].reason, r.skipped[0].unit, r.skipped[0].stockUnit], [4, "ghee", "unit-mismatch", "Packet", "kg"]);
  assert.ok(stockSkippedText("PUR-1", r.skipped).te.startsWith("యూనిట్ వేరు — stock మార్చలేదు, చేతితో సరిచేయండి (PUR-1): Ghee: 2 Packet"));
  // stock item without a unit: kg / blank lines as typed, Gram cannot be placed
  const noUnit = purchaseStockLines({ items: [line("x", 4, "Kg"), line("x", 3, ""), line("x", 200, "Gram")] }, {});
  assert.deepEqual(noUnit.wanted, { x: 7 });
  assert.equal(noUnit.skipped[0].reason, "stock-unit-unknown");
  // old lines without a unit go in as typed
  assert.deepEqual(wantedStockFromPurchase({ items: [line("toordal", 5, "")] }, units), { toordal: 5 });
});

test("F4 edit and cancel reverse exactly what was applied", () => {
  // first save: 500 Gram toor dal → +0.5 kg (not +500)
  const v1 = { items: [line("toordal", 500, "Gram"), line("ghee", 2, "Packet")] };
  const s1 = applyOnce(v1, undefined);
  assert.deepEqual(s1.delta, { toordal: 0.5 });
  assert.deepEqual(s1.next, { toordal: 0.5 });
  assert.equal(s1.skipped.length, 1);
  // edit to 2 Kg and ghee fixed to kg: +1.5 toor dal, +1 ghee
  const v2 = { items: [line("toordal", 2, "Kg"), line("ghee", 1, "kg")], stockApplied: s1.next };
  const s2 = applyOnce(v2, { ...v1, stockApplied: s1.next });
  assert.deepEqual(s2.delta, { toordal: 1.5, ghee: 1 });
  assert.deepEqual(s2.next, { toordal: 2, ghee: 1 });
  assert.equal(s2.skipped.length, 0);
  // cancel: everything applied comes back out, nothing more
  const s3 = applyOnce({ ...v2, stockApplied: s2.next, status: "Cancelled" }, { ...v2, stockApplied: s2.next });
  assert.deepEqual(s3.delta, { toordal: -2, ghee: -1 });
  assert.deepEqual(s3.next, {});
  // a purchase saved under the old bug (stockApplied 500 for 500 Gram) is corrected on its next save
  const fixed = applyOnce({ ...v1, stockApplied: { toordal: 500 } }, { ...v1, stockApplied: { toordal: 500 } });
  assert.deepEqual(fixed.delta, { toordal: -499.5 });
  // running again changes nothing (idempotent)
  assert.deepEqual(applyOnce({ ...v2, stockApplied: s2.next }, { ...v2, stockApplied: s2.next }).delta, {});
});

test("(b) invoice terms: default Telugu payment terms, no validity line; editable", () => {
  const s = normalizeSettings({ terms: "కొటేషన్ 15 రోజులు చెల్లుతుంది." });
  assert.equal(s.invoiceTerms, DEFAULT_INVOICE_TERMS);
  assert.ok(!/చెల్లుతుంది|valid/i.test(s.invoiceTerms));
  assert.equal(s.terms, "కొటేషన్ 15 రోజులు చెల్లుతుంది.");
  assert.equal(normalizeSettings({ invoiceTerms: "  నా నియమాలు " }).invoiceTerms, "నా నియమాలు");
  assert.deepEqual(applySettingsPatch({}, { invoiceTerms: "చెల్లింపు 7 రోజుల్లో" }).update, { invoiceTerms: "చెల్లింపు 7 రోజుల్లో" });
});
