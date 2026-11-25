// Module 4d step 3 — firestore.rules carries the same role matrix as the server. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULES_BLOCK_END, RULES_BLOCK_START, roleRow, rulesRoleBlock } from "../src/roles/rulesBlock";

const rules = readFileSync(join(__dirname, "../../../firestore.rules"), "utf8");

test("M4f the job-role block in firestore.rules is the generated one (run: node tools/gen-role-rules.mjs)", () => {
  const a = rules.indexOf(RULES_BLOCK_START), b = rules.indexOf(RULES_BLOCK_END);
  assert.ok(a > 0 && b > a, "markers are in firestore.rules");
  assert.equal(rules.slice(a, b + RULES_BLOCK_END.length), rulesRoleBlock());
});

test("M4f the block says what the matrix says", () => {
  assert.equal(roleRow("salesExecutive", "manager"), "manager;C:,leads,customers,quotations,bookings,receipts,;E:,leads,customers,quotations,bookings,;S:,;");
  assert.equal(roleRow("auditor", "staff"), "staff;C:,;E:,;S:,auditLog,;", "the auditor writes nothing");
  const sees = (row: string, kind: string) => new RegExp("^.*;S:[^;]*," + kind + ",.*$").test(row);
  assert.equal(sees(roleRow("hrManager", "manager"), "salary"), true);
  assert.equal(sees(roleRow("financeHead", "manager"), "profit"), true);
  assert.equal(sees(roleRow("coo", "manager"), "salary"), false);
  assert.equal(sees(roleRow("coo", "manager"), "foodCost"), true);
  assert.doesNotMatch(rulesRoleBlock(), /'owner'/, "the owner is never narrowed");
  // the same regular expression the rules use
  const may = (row: string, mods: string, action: string) => new RegExp("^.*;" + action + ":[^;]*,(" + mods + "),.*$").test(row);
  const store = roleRow("storeManager", "manager");
  assert.equal(may(store, "customers", "C"), false);
  assert.equal(may(store, "vendorBills|goodsReceipts", "C"), true);
  assert.equal(may(store, "inventory", "E"), true);
  assert.equal(may(roleRow("accountant", "manager"), "expenses", "E"), true);
  assert.equal(may(roleRow("accountant", "manager"), "vendorPayments", "E"), false, "a C module is not an E module");
  assert.equal(may(roleRow("auditor", "staff"), "vendorBills|goodsReceipts", "C"), false);
});

test("M4f the direct-write collections are guarded by jobMay", () => {
  for (const c of ["customers", "leads", "bookings", "quotations", "invoices", "purchases", "expenses", "vehicles", "equipment", "contentPlan", "dishes", "lunchBoxOrders"]) {
    const at = rules.indexOf(`match /${c}/{`);
    assert.ok(at > 0, c);
    assert.ok(rules.slice(at, at + 1500).includes("jobMay('"), `${c} writes check the job role`);
  }
});
