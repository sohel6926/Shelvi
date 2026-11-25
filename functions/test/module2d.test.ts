// Module 2d — batches, expiry dates, FEFO, expiry alerts. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Batch, daysTo, expiryNoticeText, expiryStatus, fefoOrder, isExpiryDay, nearestExpiry, normalizeExpiryAlert, parseExpiryAlertPatch, purchaseExpiryByItem, reconcileBatches } from "../src/stock/batchRules";
import { normalizeSettings } from "../src/shared/settingsModel";
import { applySettingsPatch } from "../src/settings/settingsPatch";

const b = (id: string, qty: number, expiryDay: string, receivedAtMs = 0): Batch => ({ id, qty, expiryDay, receivedAtMs });
const total = (bs: Batch[]) => bs.reduce((s, x) => s + x.qty, 0);
/** apply the changes and return the batches as they would be stored */
const apply = (bs: Batch[], stock: number) => {
  const ch = reconcileBatches(stock, bs);
  return bs.map((x) => ({ ...x, qty: ch.find((c) => c.id === x.id)?.qty ?? x.qty }));
};

test("M2d isExpiryDay", () => {
  for (const ok of ["2026-12-05", "2028-02-29", "2000-01-01"]) assert.equal(isExpiryDay(ok), true, ok);
  for (const bad of ["2026-02-30", "05/12/2026", "2026-13-01", "", null, 20261205, "1999-12-31"]) assert.equal(isExpiryDay(bad), false, String(bad));
});

test("M2d FEFO order: earliest date first, undated last, then arrival", () => {
  const bs = [b("c", 1, ""), b("a", 1, "2027-01-10"), b("d", 1, "2026-12-01", 5), b("e", 1, "2026-12-01", 2), b("f", 1, "", -1)];
  assert.deepEqual(fefoOrder(bs).map((x) => x.id), ["e", "d", "a", "f", "c"]);
});

test("M2d nothing changes while the batches fit inside the stock (untracked stock is used first)", () => {
  const bs = [b("a", 10, "2026-12-01"), b("b", 20, "2027-01-01")];
  assert.deepEqual(reconcileBatches(50, bs), []); // 20 untracked
  assert.deepEqual(reconcileBatches(30, bs), []); // exactly the batches
});

test("M2d stock falls below the batches → earliest expiry is used up first", () => {
  const bs = [b("late", 20, "2027-01-01"), b("early", 10, "2026-12-01"), b("nodate", 5, "")];
  assert.deepEqual(reconcileBatches(31, bs), [{ id: "early", qty: 6, taken: 4 }]);
  assert.deepEqual(reconcileBatches(20, bs), [{ id: "early", qty: 0, taken: 10 }, { id: "late", qty: 15, taken: 5 }]);
  assert.deepEqual(reconcileBatches(3, bs), [{ id: "early", qty: 0, taken: 10 }, { id: "late", qty: 0, taken: 20 }, { id: "nodate", qty: 3, taken: 2 }]);
  assert.deepEqual(reconcileBatches(0, bs).map((c) => c.qty), [0, 0, 0]);
  assert.deepEqual(reconcileBatches(-5, bs).map((c) => c.qty), [0, 0, 0]);
});

test("M2d invariant over many random cases: batches never exceed stock, never go negative, running twice changes nothing", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 300; i++) {
    const bs = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => b(`b${k}`, Math.round(rnd() * 400) / 10, rnd() < 0.3 ? "" : `2026-12-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`, Math.floor(rnd() * 100)));
    const stock = Math.round(rnd() * 800) / 10;
    const after = apply(bs, stock);
    assert.ok(after.every((x) => x.qty >= 0), "no negative batch");
    assert.ok(total(after) <= stock + 1e-6, `sum ${total(after)} within stock ${stock}`);
    assert.ok(Math.abs(total(after) - Math.min(stock, total(bs))) < 0.005, "only the excess is taken");
    assert.deepEqual(reconcileBatches(stock, after), [], "idempotent");
    // FEFO: a batch still holding stock never has an earlier date than a batch that was reduced only partly… i.e. every
    // fully-kept dated batch is later than or equal to every emptied dated batch
    const emptied = after.filter((x, k) => x.qty === 0 && bs[k].qty > 0 && x.expiryDay).map((x) => x.expiryDay);
    const untouched = after.filter((x, k) => x.qty === bs[k].qty && x.qty > 0 && x.expiryDay).map((x) => x.expiryDay);
    if (emptied.length && untouched.length) assert.ok(emptied.sort().at(-1)! <= untouched.sort()[0], "earlier dates go first");
  }
});

test("M2d nearest expiry ignores empty and undated batches", () => {
  assert.equal(nearestExpiry([b("a", 0, "2026-11-20"), b("b", 4, "2026-12-15"), b("c", 2, "2026-12-01"), b("d", 9, "")]), "2026-12-01");
  assert.equal(nearestExpiry([b("d", 9, "")]), "");
  assert.equal(nearestExpiry([]), "");
});

test("M2d expiry status and days", () => {
  const today = "2026-11-18";
  assert.equal(daysTo("2026-11-25", today), 7);
  assert.equal(expiryStatus("2026-11-17", today, 7), "expired");
  assert.equal(expiryStatus("2026-11-18", today, 7), "soon", "expires today: still usable today");
  assert.equal(expiryStatus("2026-11-25", today, 7), "soon");
  assert.equal(expiryStatus("2026-11-26", today, 7), "ok");
  assert.equal(expiryStatus("", today, 7), "none");
  assert.equal(expiryStatus("soon", today, 7), "none");
});

test("M2d purchase lines → expiry per stock item (earliest date wins, lines without a date ignored)", () => {
  const items = [
    { inventoryItemId: "ghee", expiryDay: "2027-03-01", batchNo: " B-2 " },
    { inventoryItemId: "ghee", expiryDay: "2027-01-15", batchNo: "B-1" },
    { inventoryItemId: "rice" },
    { inventoryItemId: "milk", expiryDay: "31/12/2026" },
    { expiryDay: "2026-12-01" },
  ];
  assert.deepEqual(purchaseExpiryByItem(items), { ghee: { expiryDay: "2027-01-15", batchNo: "B-1" } });
  assert.deepEqual(purchaseExpiryByItem(undefined), {});
});

test("M2d expiry alert settings: default on / 7 days, strict patch", () => {
  assert.deepEqual(normalizeSettings(undefined).expiryAlert, { on: true, days: 7 });
  assert.deepEqual(normalizeExpiryAlert({ on: false, days: 3 }), { on: false, days: 3 });
  assert.deepEqual(normalizeExpiryAlert({ on: "y", days: 0 }), { on: false, days: 7 });
  assert.equal(parseExpiryAlertPatch({ on: true, days: 0 }).ok, false);
  assert.equal(parseExpiryAlertPatch({ on: true, days: 91 }).ok, false);
  assert.equal(parseExpiryAlertPatch({ on: true, days: 2.5 }).ok, false);
  assert.equal(parseExpiryAlertPatch({ days: 5 }).ok, false);
  const good = applySettingsPatch({}, { expiryAlert: { on: true, days: 10 } });
  assert.deepEqual(good.update, { expiryAlert: { on: true, days: 10 } });
  assert.equal(applySettingsPatch({}, { expiryAlert: { on: true, days: 500 } }).errors.length, 1);
});

test("M2d daily notice text: expired first, nothing when all is fine", () => {
  assert.equal(expiryNoticeText([{ name: "Rice", expiryDay: "2027-01-01", status: "ok" }], 7), null);
  const t = expiryNoticeText([{ name: "Ghee", expiryDay: "2026-11-20", status: "soon" }, { name: "Milk powder", expiryDay: "2026-11-10", status: "expired" }], 7)!;
  assert.equal(t.en, "Expired 1: Milk powder (2026-11-10) · Expiring within 7 days 1: Ghee (2026-11-20)");
  assert.ok(t.te.startsWith("గడువు దాటినవి 1"));
  const many = expiryNoticeText(Array.from({ length: 10 }, (_, i) => ({ name: `I${i}`, expiryDay: "2026-11-19", status: "soon" as const })), 7)!;
  assert.ok(many.en.endsWith("+2"));
});
