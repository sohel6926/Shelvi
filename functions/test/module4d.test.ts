// Module 4d — the 17 business roles, the permission matrix and separation of duties. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, DEFAULT_SOD, MODULES, ROLES, allowed, canHoldRole, canSee, effectiveRole, levelOf, modulesOf, normalizeSod, parseSodPatch, purchaseSodClash, sodMessage } from "../src/roles/permRules";

test("M4d the spec's 17 roles and 10 actions", () => {
  assert.equal(ROLES.length, 17);
  assert.equal(new Set(ROLES.map((r) => r.code)).size, 17);
  assert.equal(Object.keys(ACTIONS).join(""), "VCESXAPRDO");
  assert.equal(ROLES.filter((r) => r.level === "admin").length, 1, "only the owner sits on the admin level");
  assert.equal(levelOf("driver"), "staff");
  assert.equal(levelOf("accountant"), "manager");
});

test("M4d until a role is given, the old three levels work as before", () => {
  assert.equal(effectiveRole("admin", undefined), "owner");
  assert.equal(effectiveRole("admin", "accountant"), "owner", "the owner is never narrowed");
  assert.equal(effectiveRole("manager", undefined), "coo");
  assert.equal(effectiveRole("manager", "accountant"), "accountant");
  assert.equal(effectiveRole("manager", "driver"), "coo", "a role of another level is ignored");
  assert.equal(effectiveRole("staff", "driver"), "driver");
  assert.equal(effectiveRole("staff", "nonsense"), "worker");
  assert.equal(canHoldRole("manager", "storeManager"), true);
  assert.equal(canHoldRole("staff", "storeManager"), false, "a manager-level role cannot be given to a staff login");
  assert.equal(canHoldRole("admin", "owner"), false, "owner is not handed out as a job role");
  assert.equal(canHoldRole("staff", "auditor"), true);
});

test("M4d the owner can do everything; nobody else pays without the pay permission", () => {
  for (const m of MODULES) for (const a of Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]) assert.equal(allowed("owner", m, a), true);
  const payers = ROLES.map((r) => r.code).filter((r) => allowed(r, "vendorPayments", "P"));
  assert.deepEqual(payers, ["owner", "financeHead"]);
  assert.equal(allowed("accountant", "vendorPayments", "P"), false, "the accountant prepares, does not pay");
  assert.equal(allowed("accountant", "vendorPayments", "A"), false, "payment approval restricted");
  assert.equal(allowed("purchaseManager", "vendorPayments", "V"), false, "purchase: no payment");
  assert.equal(allowed("purchaseManager", "purchaseOrders", "A"), true);
  assert.equal(allowed("storeManager", "goodsReceipts", "C"), true);
  assert.equal(allowed("storeManager", "inventory", "A"), false, "stock adjustments are approved by another role");
  assert.equal(allowed("salesExecutive", "quotations", "A"), false, "no discount approval");
  assert.equal(allowed("salesManager", "quotations", "A"), true);
  assert.equal(allowed("hrManager", "ledger", "V"), false, "no business P&L detail");
  assert.equal(allowed("marketing", "invoices", "V"), false);
  assert.equal(allowed("systemAdmin", "vendorPayments", "V"), false, "no business pay permission by default");
  assert.equal(allowed("systemAdmin", "users", "E"), true);
  assert.equal(allowed("driver", "vehicles", "E"), true);
  assert.equal(allowed("driver", "bookings", "V"), false);
});

test("M4d the auditor only reads", () => {
  for (const m of MODULES) {
    assert.equal(allowed("auditor", m, "V"), true, m);
    for (const a of ["C", "E", "S", "X", "A", "P", "R", "D"] as const) assert.equal(allowed("auditor", m, a), false, `${m} ${a}`);
  }
  assert.equal(modulesOf("auditor").length, MODULES.length);
  assert.deepEqual(modulesOf("worker"), ["events", "attendance"]);
});

test("M4d sensitive figures", () => {
  assert.equal(canSee("owner", "profit"), true);
  assert.equal(canSee("financeHead", "profit"), true);
  assert.equal(canSee("coo", "profit"), false, "managers do not see company profit");
  assert.equal(canSee("salesExecutive", "foodCost"), false, "sales: no detailed food cost");
  assert.equal(canSee("kitchenHead", "foodCost"), true);
  assert.equal(canSee("hrManager", "salary"), true);
  assert.equal(canSee("accountant", "salary"), false);
  assert.equal(canSee("purchaseManager", "vendorBank"), true);
  assert.equal(canSee("storeManager", "vendorBank"), false);
  assert.equal(canSee("auditor", "auditLog"), true);
});

test("M4d purchase: requester, receiver, bill verifier and payer are different people above the limit", () => {
  const cfg = DEFAULT_SOD;
  const mgr = { uid: "u1", role: "storeManager" as const };
  assert.deepEqual(purchaseSodClash("receive", mgr, { requestedBy: "u1" }, 25000, cfg), { clash: "request", overridden: false });
  assert.deepEqual(purchaseSodClash("receive", mgr, { requestedBy: "u2" }, 25000, cfg), { clash: "", overridden: false });
  assert.deepEqual(purchaseSodClash("receive", mgr, { requestedBy: "u1" }, 9999.99, cfg), { clash: "", overridden: false }, "below the limit the rule does not apply");
  assert.deepEqual(purchaseSodClash("receive", mgr, { requestedBy: "u1" }, 10000, cfg), { clash: "request", overridden: false }, "at the limit it applies");
  assert.deepEqual(purchaseSodClash("verifyBill", mgr, { requestedBy: "u2", receivedBy: ["u3", "u1"] }, 25000, cfg), { clash: "receive", overridden: false });
  assert.deepEqual(purchaseSodClash("pay", { uid: "u4", role: "financeHead" }, { requestedBy: "u2", receivedBy: ["u3"], billVerifiedBy: "u4" }, 25000, cfg), { clash: "verifyBill", overridden: false });
  assert.deepEqual(purchaseSodClash("pay", { uid: "u9", role: "financeHead" }, { requestedBy: "u2", receivedBy: ["u3"], billVerifiedBy: "u4" }, 25000, cfg), { clash: "", overridden: false });
  assert.deepEqual(purchaseSodClash("request", mgr, { receivedBy: ["u1"] }, 25000, cfg), { clash: "", overridden: false }, "only earlier steps count");
  // the owner may do it all, and it is flagged
  assert.deepEqual(purchaseSodClash("pay", { uid: "o", role: "owner" }, { requestedBy: "o", receivedBy: ["o"], billVerifiedBy: "o" }, 25000, cfg), { clash: "", overridden: true });
  assert.deepEqual(purchaseSodClash("pay", { uid: "o", role: "owner" }, { requestedBy: "o" }, 25000, { ...cfg, ownerExempt: false }), { clash: "request", overridden: false });
  assert.deepEqual(purchaseSodClash("receive", mgr, { requestedBy: "u1" }, 25000, { ...cfg, on: false }), { clash: "", overridden: false }, "switched off");
  assert.ok(sodMessage("request").en.includes("asked for the goods"));
});

test("M4d separation settings", () => {
  assert.deepEqual(normalizeSod(undefined), DEFAULT_SOD);
  assert.deepEqual(normalizeSod({ on: false, minAmount: 500, ownerExempt: false }), { on: false, minAmount: 500, ownerExempt: false });
  assert.deepEqual(normalizeSod({ minAmount: -1 }), DEFAULT_SOD);
  assert.ok(parseSodPatch({ on: true, minAmount: 0, ownerExempt: true }).ok);
  for (const v of [null, [], { on: true, minAmount: 1 }, { on: "y", minAmount: 1, ownerExempt: true }, { on: true, minAmount: -1, ownerExempt: true }]) assert.equal(parseSodPatch(v).ok, false, JSON.stringify(v));
});
