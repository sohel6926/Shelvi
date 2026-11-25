// Module 2g — stock reserved for confirmed events. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, freeFor, holdsStock, normalizeStockReserve, parseStockReservePatch, reservationInputsChanged } from "../src/stock/reservationRules";
import { normalizeSettings } from "../src/shared/settingsModel";
import { applySettingsPatch } from "../src/settings/settingsPatch";

test("M2g which bookings hold stock", () => {
  assert.equal(holdsStock({ status: "Confirmed" }), true);
  assert.equal(holdsStock({ status: "InProgress" }), true);
  for (const s of ["Inquiry", "Completed", "Cancelled", "Closed", ""]) assert.equal(holdsStock({ status: s }), false, s);
  assert.equal(holdsStock({ status: "Confirmed", archived: true }), false);
  assert.equal(holdsStock({ status: "InProgress", stockDeduction: { reversed: false } }), false, "stock already taken out");
  assert.equal(holdsStock({ status: "InProgress", stockDeduction: { reversed: true } }), true, "deduction was put back");
  assert.equal(holdsStock(undefined), false);
});

test("M2g earlier events are served first; later ones are short by the rest", () => {
  const r = allocate(
    [
      { bookingId: "late", day: "2026-11-25", needs: { rice: 60, oil: 5 } },
      { bookingId: "early", day: "2026-11-20", needs: { rice: 70, ghee: 2 } },
    ],
    { rice: 100, oil: 20 },
  );
  assert.deepEqual(r.byEvent.early, [{ inventoryItemId: "ghee", needed: 2, reserved: 0, short: 2 }, { inventoryItemId: "rice", needed: 70, reserved: 70, short: 0 }]);
  assert.deepEqual(r.byEvent.late, [{ inventoryItemId: "oil", needed: 5, reserved: 5, short: 0 }, { inventoryItemId: "rice", needed: 60, reserved: 30, short: 30 }]);
  assert.deepEqual(r.reserved, { rice: 100, oil: 5 });
});

test("M2g same day → by booking id; zero and negative needs / stock are ignored", () => {
  const r = allocate([{ bookingId: "b", day: "2026-11-20", needs: { x: 4, y: 0, z: -1 } }, { bookingId: "a", day: "2026-11-20", needs: { x: 4 } }], { x: 6, w: -3 });
  assert.equal(r.byEvent.a[0].reserved, 4);
  assert.deepEqual(r.byEvent.b, [{ inventoryItemId: "x", needed: 4, reserved: 2, short: 2 }]);
  assert.deepEqual(allocate([{ bookingId: "a", day: "2026-11-20", needs: { w: 2 } }], { w: -3 }).reserved, {});
});

test("M2g invariant: reserved never exceeds stock or need (300 random cases)", () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 300; i++) {
    const items = ["a", "b", "c"];
    const stock = Object.fromEntries(items.map((k) => [k, Math.round(rnd() * 500) / 10]));
    const events = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => ({ bookingId: `e${k}`, day: `2026-11-${String(18 + Math.floor(rnd() * 10)).padStart(2, "0")}`, needs: Object.fromEntries(items.filter(() => rnd() < 0.7).map((it) => [it, Math.round(rnd() * 400) / 10])) }));
    const r = allocate(events, stock);
    for (const it of items) {
      const need = events.reduce((s, e) => s + (e.needs[it] ?? 0), 0);
      const res = r.reserved[it] ?? 0;
      assert.ok(res <= stock[it] + 1e-6 && res <= need + 1e-6);
      assert.ok(Math.abs(res - Math.min(stock[it], need)) < 0.01, "everything that can be reserved is reserved");
    }
    for (const lines of Object.values(r.byEvent)) for (const l of lines) assert.ok(l.reserved >= 0 && l.short >= 0 && Math.abs(l.reserved + l.short - l.needed) < 0.002);
  }
});

test("M2g free stock for one event: others' reservations are taken away, its own is not", () => {
  assert.equal(freeFor(100, 80, 30), 50);
  assert.equal(freeFor(100, 0, 0), 100);
  assert.equal(freeFor(40, 90, 10), 0);
  assert.equal(freeFor(100, 30, 30), 100);
});

test("M2g recompute only when something that matters changed", () => {
  const b = { status: "Confirmed", eventDate: { _seconds: 100 }, guestCount: 200, menuPackageId: "m1" };
  assert.equal(reservationInputsChanged(b, { ...b, notes: "call back" } as never), false);
  assert.equal(reservationInputsChanged(b, { ...b, guestCount: 250 }), true);
  assert.equal(reservationInputsChanged(b, { ...b, eventDate: { _seconds: 200 } }), true);
  assert.equal(reservationInputsChanged({ ...b, status: "Inquiry" }, b), true, "just confirmed");
  assert.equal(reservationInputsChanged(b, { ...b, status: "Completed" }), true);
  assert.equal(reservationInputsChanged({ ...b, status: "Inquiry" }, { ...b, status: "Inquiry", guestCount: 9 }), false, "an enquiry holds nothing");
  assert.equal(reservationInputsChanged(b, undefined), true);
});

test("M2g settings: default on / 30 days, strict patch", () => {
  assert.deepEqual(normalizeSettings(undefined).stockReserve, { on: true, days: 30 });
  assert.deepEqual(normalizeStockReserve({ on: false, days: 7 }), { on: false, days: 7 });
  assert.equal(parseStockReservePatch({ on: true, days: 0 }).ok, false);
  assert.equal(parseStockReservePatch({ on: true }).ok, false);
  assert.deepEqual(applySettingsPatch({}, { stockReserve: { on: false, days: 14 } }).update, { stockReserve: { on: false, days: 14 } });
  assert.equal(applySettingsPatch({}, { stockReserve: { on: true, days: 365 } }).errors.length, 1);
});
