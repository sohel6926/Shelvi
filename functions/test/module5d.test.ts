// Module 5d — food safety part 1: a batch on hold, its decision, and tracing a batch. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Batch, expiredQty, fefoOrder, heldQty, holdDecisionProblem, reconcileBatches, traceBatchUses, usableStock } from "../src/stock/batchRules";

const b = (id: string, qty: number, expiryDay: string, hold = false): Batch => ({ id, qty, expiryDay, receivedAtMs: 0, hold });

test("M5d a held batch is not planned with, even when its date is fine", () => {
  const batches = [b("a", 10, "2026-12-31"), b("h", 6, "2026-12-31", true), b("old", 4, "2026-11-01")];
  assert.equal(expiredQty(batches, "2026-11-19"), 10, "6 held + 4 past their date");
  assert.equal(heldQty(batches), 6);
  assert.equal(usableStock(20, expiredQty(batches, "2026-11-19")), 10, "only the free batch may be reserved or sold");
  assert.equal(expiredQty([b("a", 10, "2026-12-31")], "2026-11-19"), 0);
  assert.equal(heldQty([b("x", 0, "", true)]), 0, "an empty held batch holds nothing");
});

test("M5d a held batch is the last to be consumed", () => {
  const batches = [b("h", 6, "2026-11-20", true), b("a", 10, "2026-12-31"), b("n", 5, "")];
  assert.deepEqual(fefoOrder(batches).map((x) => x.id), ["a", "n", "h"], "earliest date first among the free ones, the held one last");
  // 21 in batches, stock drops to 12: 9 leave, taken from the free batches
  assert.deepEqual(reconcileBatches(12, batches).map((c) => [c.id, c.qty]), [["a", 1]]);
  // stock drops to 3: free batches are emptied first, only then the held one
  assert.deepEqual(reconcileBatches(3, batches).map((c) => [c.id, c.qty]), [["a", 0], ["n", 0], ["h", 3]]);
});

test("M5d who may decide a hold", () => {
  const held = { exists: true, hold: true, heldBy: "u1", qty: 6 };
  assert.equal(holdDecisionProblem(held, { uid: "u2", isOwner: false, mayApprove: true }), "");
  assert.equal(holdDecisionProblem(held, { uid: "u1", isOwner: false, mayApprove: true }), "own-hold", "not the person who placed it");
  assert.equal(holdDecisionProblem(held, { uid: "u1", isOwner: true, mayApprove: true }), "", "the owner may");
  assert.equal(holdDecisionProblem(held, { uid: "u2", isOwner: false, mayApprove: false }), "not-allowed", "a store manager holds but does not release");
  assert.equal(holdDecisionProblem({ ...held, hold: false }, { uid: "u2", isOwner: true, mayApprove: true }), "not-held");
  assert.equal(holdDecisionProblem({ exists: false, hold: false, heldBy: "", qty: 0 }, { uid: "u2", isOwner: true, mayApprove: true }), "no-batch");
});

test("M5d tracing a batch to the events it went to", () => {
  const moves = [
    { id: "m1", day: "2026-11-10", data: { type: "OUT", reason: "event", relatedBookingId: "bk1", batchesUsed: [{ batchId: "B", taken: 4 }, { batchId: "other", taken: 2 }] } },
    { id: "m2", day: "2026-11-12", data: { type: "OUT", reason: "event", bookingId: "bk2", batchesUsed: [{ batchId: "B", taken: 1.5 }] } },
    { id: "m3", day: "2026-11-12", data: { type: "OUT", reason: "damage", batchesUsed: [{ batchId: "B", taken: 0.5 }] } },
    { id: "m4", day: "2026-11-13", data: { type: "OUT", reason: "event", relatedBookingId: "bk3", batchesUsed: [{ batchId: "other", taken: 9 }] } },
    { id: "m5", day: "2026-11-14", data: { type: "IN", reason: "purchase" } },
    { id: "m6", day: "2026-11-15", data: { type: "OUT", reason: "event", relatedBookingId: "bk1", batchesUsed: [{ batchId: "B", taken: 1 }] } },
  ];
  const t = traceBatchUses("B", moves);
  assert.deepEqual(t.uses.map((u) => u.movementId), ["m6", "m2", "m3", "m1"], "newest first; movements of other batches are left out");
  assert.deepEqual(t.bookingIds.sort(), ["bk1", "bk2"]);
  assert.equal(t.totalTaken, 7);
  assert.deepEqual(traceBatchUses("nobody", moves), { uses: [], bookingIds: [], totalTaken: 0 });
});
