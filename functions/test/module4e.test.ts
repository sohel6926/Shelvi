// Module 4d step 2 — the job role is checked on the server for every callable. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CALLABLE_PERMS, STAFF_WRITES, callableDecision, callerSees } from "../src/roles/callablePerms";

const A = ["admin"], AM = ["admin", "manager"], ALL = ["admin", "manager", "staff"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? sources(join(dir, f)) : f.endsWith(".ts") ? [join(dir, f)] : []));
}

test("M4e every callable in src/ is named and has a line in the permission table", () => {
  const names: string[] = [];
  for (const file of sources(join(__dirname, "../../src"))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/export const (\w+) = callable\(\s*("(\w+)")?/g)) {
      assert.equal(m[3], m[1], `${file}: callable ${m[1]} must pass its own name first`);
      names.push(m[1]);
    }
  }
  assert.ok(names.length >= 80, "found the callables");
  for (const n of names) assert.ok(n in CALLABLE_PERMS, `${n} is missing from CALLABLE_PERMS`);
  names.push("adjustStock"); // the one raw onCall: it calls callableDecision itself (inventory/adjustStock.ts)
  for (const n of Object.keys(CALLABLE_PERMS)) assert.ok(names.includes(n), `${n} is in CALLABLE_PERMS but is not a callable`);
  for (const n of STAFF_WRITES) assert.ok(names.includes(n));
});

test("M4e a login with no job role works exactly as before", () => {
  assert.equal(callableDecision("recordPayment", AM, "manager", ""), "allow");
  assert.equal(callableDecision("recordPayment", AM, "staff", ""), "deny-level");
  assert.equal(callableDecision("ledgerReport", A, "manager", ""), "deny-level", "nothing widens without a role");
  assert.equal(callableDecision("saveCookLog", ALL, "staff", undefined), "allow");
  assert.equal(callableDecision("receiveGoods", AM, "manager", "driver"), "allow", "a role of another level is ignored");
});

test("M4e the owner is never narrowed", () => {
  for (const n of Object.keys(CALLABLE_PERMS)) assert.equal(callableDecision(n, A, "admin", "accountant"), "allow");
});

test("M4e a job role narrows inside the manager level", () => {
  assert.equal(callableDecision("receiveGoods", AM, "manager", "salesExecutive"), "deny-role");
  assert.equal(callableDecision("receiveGoods", AM, "manager", "storeManager"), "allow");
  assert.equal(callableDecision("saveQuotation", AM, "manager", "storeManager"), "deny-role");
  assert.equal(callableDecision("saveQuotation", AM, "manager", "salesExecutive"), "allow");
  assert.equal(callableDecision("assignLead", AM, "manager", "salesExecutive"), "deny-role", "assigning is the sales manager's");
  assert.equal(callableDecision("assignLead", AM, "manager", "salesManager"), "allow");
  assert.equal(callableDecision("recordPayment", AM, "manager", "kitchenHead"), "deny-role", "no customer finance for the kitchen");
  assert.equal(callableDecision("decidePurchaseRequest", AM, "manager", "storeManager"), "deny-role");
  assert.equal(callableDecision("decidePurchaseRequest", AM, "manager", "purchaseManager"), "allow");
  assert.equal(callableDecision("saveVendorBill", AM, "manager", "purchaseManager"), "deny-role", "the buyer does not enter the bill");
  assert.equal(callableDecision("saveVendorBill", AM, "manager", "accountant"), "allow");
  assert.equal(callableDecision("saveBusinessSettings", A, "manager", "systemAdmin"), "deny-level", "owner controls stay with the owner");
});

test("M4e finance roles reach the books and vendor payments — and only what the matrix gives", () => {
  assert.equal(callableDecision("ledgerReport", A, "manager", "financeHead"), "allow");
  assert.equal(callableDecision("ledgerReport", A, "manager", "accountant"), "allow");
  assert.equal(callableDecision("saveJournalEntry", A, "manager", "accountant"), "allow");
  assert.equal(callableDecision("cancelJournalEntry", A, "manager", "accountant"), "deny-level", "reversing is not the accountant's");
  assert.equal(callableDecision("cancelJournalEntry", A, "manager", "financeHead"), "allow");
  assert.equal(callableDecision("recordVendorPayment", A, "manager", "accountant"), "deny-level", "the accountant prepares, does not pay");
  assert.equal(callableDecision("recordVendorPayment", A, "manager", "financeHead"), "allow");
  assert.equal(callableDecision("getVendorDues", A, "manager", "accountant"), "allow");
  assert.equal(callableDecision("getPnl", A, "manager", "accountant"), "deny-level", "profit is for the owner and the finance head");
  assert.equal(callableDecision("getPnl", A, "manager", "financeHead"), "allow");
  assert.equal(callableDecision("releaseBillHold", A, "manager", "financeHead"), "allow");
  assert.equal(callableDecision("ledgerReport", A, "manager", "salesManager"), "deny-level");
  assert.equal(callableDecision("lockPeriod", AM, "manager", "financeHead"), "allow", "the owner decided (20 Nov): a manager may lock a month too");
  assert.equal(callableDecision("unlockPeriod", A, "manager", "financeHead"), "deny-level", "re-opening a month stays with the owner");
  assert.equal(callableDecision("ledgerReport", A, "staff", "auditor"), "deny-level", "widening is for the manager level only");
});

test("M4e the auditor only looks; workers keep their everyday work", () => {
  for (const n of STAFF_WRITES) assert.equal(callableDecision(n, ALL, "staff", "auditor"), "deny-role");
  assert.equal(callableDecision("cookingPlan", ALL, "staff", "auditor"), "allow");
  assert.equal(callableDecision("getTargetBoard", ALL, "staff", "auditor"), "allow");
  for (const n of STAFF_WRITES) assert.equal(callableDecision(n, ALL, "staff", "worker"), "allow");
  assert.equal(callableDecision("markAttendance", ALL, "staff", "driver"), "allow");
  assert.equal(callableDecision("recordPayment", AM, "staff", "worker"), "deny-level");
});

test("M4e sensitive figures: pay is for the owner, finance head and HR", () => {
  assert.equal(callableDecision("monthPayroll", A, "manager", "hrManager"), "allow");
  assert.equal(callableDecision("monthPayroll", A, "manager", "financeHead"), "allow");
  assert.equal(callableDecision("monthPayroll", A, "manager", "coo"), "deny-level");
  assert.equal(callableDecision("monthPayroll", A, "manager", ""), "deny-level");
  assert.equal(callableDecision("finalizePayroll", A, "manager", "hrManager"), "deny-level", "paying salaries stays with the owner");
  assert.equal(callerSees("admin", "", "salary"), true);
  assert.equal(callerSees("manager", "", "salary"), true, "no role: as before");
  assert.equal(callerSees("manager", "eventManager", "salary"), false);
  assert.equal(callerSees("manager", "hrManager", "salary"), true);
  assert.equal(callerSees("manager", "hrManager", "profit"), false);
  assert.equal(callerSees("staff", "worker", "salary"), true, "a worker's own data is decided by the handler");
  assert.equal(callerSees("staff", "auditor", "salary"), false);
});
