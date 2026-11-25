// Module 4d step 5 — pay figures are kept apart from the staff document. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPayFields, payOf, payToMove } from "../src/staff/payRules";

test("M4g pay comes from the private document once it has been moved", () => {
  assert.deepEqual(payOf({ name: "Ravi", payType: "daily" }, { dailyWage: 700, monthlySalary: 0 }), { dailyWage: 700, monthlySalary: 0 });
  assert.deepEqual(payOf({ name: "Ravi" }, undefined), { dailyWage: 0, monthlySalary: 0 });
  assert.deepEqual(payOf(undefined, { monthlySalary: 18000 }), { dailyWage: 0, monthlySalary: 18000 });
});

test("M4g old data still on the staff document keeps working", () => {
  assert.deepEqual(payOf({ dailyWage: 650, monthlySalary: 0 }, undefined), { dailyWage: 650, monthlySalary: 0 });
});

test("M4g a figure just written on the staff document wins over the private one, field by field", () => {
  assert.deepEqual(payOf({ dailyWage: 800 }, { dailyWage: 700, monthlySalary: 15000 }), { dailyWage: 800, monthlySalary: 15000 });
  assert.deepEqual(payOf({ dailyWage: 0 }, { dailyWage: 700 }), { dailyWage: 0, monthlySalary: 0 }, "a typed zero is a real change");
});

test("M4g bad figures count as zero", () => {
  assert.deepEqual(payOf({ dailyWage: -5, monthlySalary: "x" }, undefined), { dailyWage: 0, monthlySalary: 0 });
});

test("M4g the mover takes only what is on the staff document", () => {
  assert.equal(hasPayFields({ name: "A" }), false);
  assert.equal(hasPayFields({ name: "A", monthlySalary: 0 }), true);
  assert.equal(hasPayFields(undefined), false);
  assert.deepEqual(payToMove({ name: "A", dailyWage: 700 }), { dailyWage: 700 });
  assert.deepEqual(payToMove({ dailyWage: 700, monthlySalary: 12000 }), { dailyWage: 700, monthlySalary: 12000 });
});
