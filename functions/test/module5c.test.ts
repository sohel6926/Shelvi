// Module 5c — stock by store and transfers between stores. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { receiveStoreProblem, afterStoreChange, afterTransfer, balanceIn, cleanStoreQty, homeStoreOf, rehome, storeBalances, transferProblem } from "../src/stock/storeRules";

test("M5c the home store holds whatever is not in another store", () => {
  assert.deepEqual(storeBalances(100, {}, "main"), { main: 100 }, "old stock with no breakdown is all in the home store");
  assert.deepEqual(storeBalances(100, { cold: 30, dry: 10 }, "main"), { main: 60, cold: 30, dry: 10 });
  assert.equal(balanceIn(100, { cold: 30 }, "main", "cold"), 30);
  assert.equal(balanceIn(100, { cold: 30 }, "main", "nowhere"), 0);
  assert.deepEqual(storeBalances(20, { cold: 30 }, "main"), { main: -10, cold: 30 }, "a shortfall shows in the home store, it is not hidden");
  assert.deepEqual(storeBalances(50, { cold: 5 }, ""), { cold: 5 }, "no stores set up yet");
});

test("M5c the stored map is kept clean", () => {
  assert.deepEqual(cleanStoreQty({ cold: 5, main: 9, zero: 0, neg: -2, bad: "x" }, "main"), { cold: 5 });
  assert.deepEqual(cleanStoreQty(null, "main"), {});
});

test("M5c home store of an item", () => {
  const stores = [{ id: "s1", data: { storeType: "cold", status: "active" } }, { id: "s2", data: { storeType: "main", status: "active" } }, { id: "s3", data: { storeType: "main", status: "archived" } }];
  assert.equal(homeStoreOf({}, stores), "s2", "the branch's main store");
  assert.equal(homeStoreOf({ homeStoreId: "s1" }, stores), "s1");
  assert.equal(homeStoreOf({ homeStoreId: "s3" }, stores), "s2", "an archived home falls back");
  assert.equal(homeStoreOf({}, [{ id: "s1", data: { storeType: "cold", status: "active" } }]), "s1", "no main store: the first one");
  assert.equal(homeStoreOf({}, []), "");
});

const base = { total: 100, storeQty: { cold: 30 }, homeStoreId: "main", itemBranchId: "b1", isOwner: false, from: { branchId: "b1", status: "active" }, to: { branchId: "b1", status: "active" } };

test("M5c a transfer must be possible", () => {
  assert.equal(transferProblem({ ...base, fromStoreId: "main", toStoreId: "cold", quantity: 70 }), "", "all of the home store's 70");
  assert.equal(transferProblem({ ...base, fromStoreId: "main", toStoreId: "cold", quantity: 70.5 }), "not-enough");
  assert.equal(transferProblem({ ...base, fromStoreId: "cold", toStoreId: "main", quantity: 30 }), "");
  assert.equal(transferProblem({ ...base, fromStoreId: "cold", toStoreId: "main", quantity: 31 }), "not-enough");
  assert.equal(transferProblem({ ...base, fromStoreId: "main", toStoreId: "main", quantity: 1 }), "same-store");
  assert.equal(transferProblem({ ...base, fromStoreId: "main", toStoreId: "cold", quantity: 0 }), "bad-quantity");
  assert.equal(transferProblem({ ...base, fromStoreId: "main", toStoreId: "cold", quantity: 1, to: undefined }), "no-store");
  assert.equal(transferProblem({ ...base, fromStoreId: "main", toStoreId: "cold", quantity: 1, to: { branchId: "b2", status: "active" } }), "other-branch");
  assert.equal(transferProblem({ ...base, fromStoreId: "main", toStoreId: "cold", quantity: 1, to: { branchId: "b1", status: "inactive" } }), "not-in-use");
});

test("M5c quarantine and scrap stock is not issued normally", () => {
  const q = { ...base, storeQty: { quar: 5 }, fromStoreId: "quar", toStoreId: "main", quantity: 2, from: { branchId: "b1", status: "active", issueBlocked: true } };
  assert.equal(transferProblem(q), "blocked");
  assert.equal(transferProblem({ ...q, isOwner: true }), "", "the owner's approved reversal");
  assert.equal(transferProblem({ ...base, fromStoreId: "main", toStoreId: "quar", quantity: 2, to: { branchId: "b1", status: "active", issueBlocked: true } }), "", "putting stock INTO quarantine is normal");
});

test("M5c after a transfer the total is the same and each store moved", () => {
  const before = storeBalances(100, { cold: 30 }, "main");
  const map = afterTransfer({ cold: 30 }, "main", "main", "dry", 25);
  const after = storeBalances(100, map, "main");
  assert.deepEqual(after, { main: 45, cold: 30, dry: 25 });
  assert.equal(Object.values(after).reduce((a, b) => a + b, 0), Object.values(before).reduce((a, b) => a + b, 0));
  assert.deepEqual(afterTransfer({ cold: 30 }, "main", "cold", "main", 30), {}, "an emptied store leaves the map");
  assert.deepEqual(afterTransfer({ cold: 30, dry: 5 }, "main", "cold", "dry", 10), { cold: 20, dry: 15 });
});

test("M5c a hand change in a named store", () => {
  assert.deepEqual(afterStoreChange({ cold: 30 }, "main", "cold", -4), { cold: 26 });
  assert.deepEqual(afterStoreChange({ cold: 30 }, "main", "main", -4), { cold: 30 }, "the home store is not in the map; the total carries it");
  assert.deepEqual(afterStoreChange({}, "main", "dry", 7), { dry: 7 });
});

test("M5c naming another home store moves nothing", () => {
  const before = storeBalances(100, { cold: 30, dry: 10 }, "main");
  const map = rehome(100, { cold: 30, dry: 10 }, "main", "cold");
  assert.deepEqual(map, { main: 60, dry: 10 });
  assert.deepEqual(storeBalances(100, map, "cold"), { cold: 30, main: 60, dry: 10 });
  assert.deepEqual(storeBalances(100, map, "cold").cold, before.cold);
});

test("M6a goods can be received only into a usable store of the order's branch", () => {
  const ok = { branchId: "b1", status: "active" };
  assert.equal(receiveStoreProblem(ok, "b1"), "");
  assert.equal(receiveStoreProblem(undefined, "b1"), "no-store");
  assert.equal(receiveStoreProblem({ ...ok, branchId: "b2" }, "b1"), "other-branch");
  assert.equal(receiveStoreProblem({ ...ok, status: "inactive" }, "b1"), "not-in-use");
  assert.equal(receiveStoreProblem({ ...ok, status: "archived" }, "b1"), "not-in-use");
  assert.equal(receiveStoreProblem({ ...ok, issueBlocked: true }, "b1"), "blocked");
});

test("M6a receiving into another store adds there, and cancelling takes it out of there", () => {
  const added = afterStoreChange({}, "main", "cold", 12);
  assert.deepEqual(added, { cold: 12 });
  assert.deepEqual(storeBalances(112, added, "main"), { main: 100, cold: 12 }, "home keeps what it had");
  assert.deepEqual(afterStoreChange(added, "main", "cold", -12), {}, "reversal empties that store");
  assert.deepEqual(afterStoreChange({}, "main", "main", 12), {}, "receiving into the home store changes only the total");
});
