// Module 5a — Company -> Brand -> Branch -> Kitchen -> Store masters. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MasterWorld, duplicateOf, firstSetupPlan, isGstin, isPan, liveChildren, masterCode, parentProblem, parseBranch, parseBrand, parseCompany, parseKitchen, parseStore, statusChangeProblem, statusOf } from "../src/masters/masterRules";

const GSTIN = "36ABCDE1234F1Z5";

test("M5a display codes", () => {
  assert.equal(masterCode("company", 1), "COM-0001");
  assert.equal(masterCode("store", 42), "STR-0042");
  assert.equal(masterCode("kitchen", 0), "KIT-0001");
});

test("M5a GSTIN and PAN shapes", () => {
  assert.equal(isGstin(GSTIN), true);
  assert.equal(isGstin("36ABCDE1234F1X5"), false, "the 14th character is Z");
  assert.equal(isGstin("ABCDE1234F"), false);
  assert.equal(isPan("ABCDE1234F"), true);
  assert.equal(isPan("ABCD1234FF"), false);
});

test("M5a company", () => {
  const r = parseCompany({ legalName: "  Ramanadh   Global Private Limited ", gstRegistered: true, gstin: GSTIN.toLowerCase(), pan: "abcde1234f", address: { line1: "Plot 1", city: "Hyderabad", pin: "500001" }, mobile: "9876543210" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.legalName, "Ramanadh Global Private Limited");
    assert.equal(r.value.displayName, "Ramanadh Global Private Limited");
    assert.equal(r.value.gstin, GSTIN);
    assert.equal(r.value.stateCode, "36");
    assert.equal(r.value.fyStartMonth, 4);
    assert.equal((r.value.address as { country: string }).country, "India");
  }
  assert.equal(parseCompany({ legalName: "" }).ok, false);
  assert.equal(parseCompany({ legalName: "A", gstRegistered: true, gstin: "bad" }).ok, false);
  assert.equal(parseCompany({ legalName: "A", gstRegistered: false, gstin: GSTIN }).ok, false, "a GSTIN without being registered is a contradiction");
  assert.equal(parseCompany({ legalName: "A", gstRegistered: true, gstin: GSTIN, pan: "ZZZZZ9999Z" }).ok, false, "PAN must be the one inside the GSTIN");
  assert.equal(parseCompany({ legalName: "A", address: { pin: "12" } }).ok, false);
  assert.equal(parseCompany({ legalName: "A", mobile: "12345" }).ok, false);
  assert.equal(parseCompany({ legalName: "A" }).ok, true, "an unregistered business needs only its name");
});

test("M5a brand, branch, kitchen, store", () => {
  const b = parseBrand({ name: "Suseela Caterings", companyId: "c1", businessTypes: ["pureVeg", "wedding", "junk"], vegOnly: true, nonVegAllowed: true });
  assert.ok(b.ok);
  if (b.ok) {
    assert.deepEqual(b.value.businessTypes, ["pureVeg", "wedding"]);
    assert.equal(b.value.nonVegAllowed, false, "veg only wins");
    assert.equal(b.value.invoiceDisplayName, "Suseela Caterings");
  }
  assert.equal(parseBrand({ name: "X" }).ok, false, "a brand needs its company");
  const br = parseBranch({ name: "Hyderabad", companyId: "c1", brandIds: ["b1", "b1", "b2", "a/b"], branchType: "nonsense" });
  assert.ok(br.ok);
  if (br.ok) {
    assert.deepEqual(br.value.brandIds, ["b1", "b2"], "a branch may serve several brands");
    assert.equal(br.value.branchType, "fullOperations");
  }
  const k = parseKitchen({ name: "Central Veg Kitchen", branchId: "br1", kitchenType: "veg", sections: ["rice", "curry", "x"] });
  assert.ok(k.ok);
  if (k.ok) {
    assert.equal(k.value.vegOnly, true);
    assert.equal(k.value.nonVegAllowed, false);
    assert.deepEqual(k.value.sections, ["rice", "curry"]);
  }
  assert.equal(parseKitchen({ name: "K", branchId: "br1", kitchenType: "nonVeg", vegOnly: true }).ok, false);
  const s = parseStore({ name: "Dairy Cold Store", branchId: "br1", storeType: "dairy", negativeStockAllowed: true });
  assert.ok(s.ok);
  if (s.ok) {
    assert.equal(s.value.temperatureControlled, true);
    assert.equal(s.value.negativeStockAllowed, false, "negative stock is never allowed by default");
    assert.equal(s.value.issueBlocked, false);
    assert.equal(s.value.adjustmentApprovalRequired, true);
  }
  const q = parseStore({ name: "Quarantine", branchId: "br1", storeType: "quarantine" });
  assert.ok(q.ok && q.value.issueBlocked === true, "quarantine stock is not issued normally");
});

const world: MasterWorld = {
  companies: [{ id: "c1", data: { legalName: "Ramanadh Global Private Limited", gstin: GSTIN, status: "active" } }, { id: "c2", data: { legalName: "Old Co", status: "archived" } }],
  brands: [{ id: "b1", data: { companyId: "c1", name: "Suseela Caterings", status: "active" } }, { id: "b9", data: { companyId: "c2", name: "Other", status: "active" } }],
  branches: [{ id: "br1", data: { companyId: "c1", name: "Hyderabad", active: true } }, { id: "br2", data: { companyId: "c1", name: "Closed", active: false } }],
  kitchens: [{ id: "k1", data: { branchId: "br1", name: "Central", status: "active" } }, { id: "k2", data: { branchId: "br2", name: "Far", status: "active" } }],
  stores: [{ id: "s1", data: { branchId: "br1", kitchenId: "k1", name: "Main", status: "active" } }],
};

test("M5a old branch documents read as active / inactive", () => {
  assert.equal(statusOf({ active: true }), "active");
  assert.equal(statusOf({ active: false }), "inactive");
  assert.equal(statusOf({ active: true, status: "archived" }), "archived");
  assert.equal(statusOf({}), "active");
});

test("M5a duplicates are refused", () => {
  assert.equal(duplicateOf("company", "", { legalName: "ramanadh global private limited" }, world.companies), "name");
  assert.equal(duplicateOf("company", "", { legalName: "New", gstin: GSTIN }, world.companies), "gstin");
  assert.equal(duplicateOf("company", "c1", { legalName: "Ramanadh Global Private Limited", gstin: GSTIN }, world.companies), "", "saving the record itself is not a duplicate");
  assert.equal(duplicateOf("company", "", { legalName: "Old Co" }, world.companies), "", "an archived record does not block the name");
  assert.equal(duplicateOf("brand", "", { companyId: "c1", name: "SUSEELA CATERINGS" }, world.brands), "name");
  assert.equal(duplicateOf("brand", "", { companyId: "c2", name: "Suseela Caterings" }, world.brands), "", "same name under another company is allowed");
  assert.equal(duplicateOf("store", "", { branchId: "br1", name: "main" }, world.stores), "name");
  assert.equal(duplicateOf("store", "", { branchId: "br2", name: "Main" }, world.stores), "");
});

test("M5a parents must exist, be in use, and fit", () => {
  assert.equal(parentProblem("brand", { companyId: "c1" }, world).ok, true);
  assert.equal(parentProblem("brand", { companyId: "c2" }, world).ok, false, "archived company");
  assert.equal(parentProblem("brand", { companyId: "nope" }, world).ok, false);
  assert.equal(parentProblem("branch", { companyId: "c1", brandIds: ["b1"] }, world).ok, true);
  assert.equal(parentProblem("branch", { companyId: "c1", brandIds: ["b9"] }, world).ok, false, "a brand of another company");
  assert.equal(parentProblem("kitchen", { branchId: "br2" }, world).ok, false, "an inactive branch takes no new kitchen");
  assert.equal(parentProblem("store", { branchId: "br1", kitchenId: "k1" }, world).ok, true);
  assert.equal(parentProblem("store", { branchId: "br1", kitchenId: "k2" }, world).ok, false, "a kitchen of another branch");
  assert.equal(parentProblem("store", { branchId: "br1", kitchenId: "" }, world).ok, true, "a store need not sit in a kitchen");
});

test("M5a nothing with live children is archived; archived is final", () => {
  assert.equal(liveChildren("company", "c1", world), 3, "one brand + two branches");
  assert.equal(statusChangeProblem("company", "c1", "active", "archived", world), "children");
  assert.equal(statusChangeProblem("company", "c1", "active", "inactive", world), "", "pausing is always possible");
  assert.equal(statusChangeProblem("kitchen", "k1", "active", "archived", world), "children");
  assert.equal(statusChangeProblem("store", "s1", "active", "archived", world), "");
  assert.equal(statusChangeProblem("store", "s1", "archived", "active", world), "archived");
  assert.equal(statusChangeProblem("store", "s1", "active", "active", world), "same");
});

test("M5a first set-up plan", () => {
  const empty: MasterWorld = { companies: [], brands: [], branches: [], kitchens: [], stores: [] };
  const branches = [{ id: "br1", data: { name: "Hyderabad", active: true } }, { id: "br2", data: { name: "Old", status: "archived" } }];
  const p = firstSetupPlan({ legalName: "Suseela Technologies Private Limited", brandName: "Suseela Caterings", gstin: "", address: "Hyderabad", phone: "9876543210" }, branches, empty);
  assert.equal(p.company?.legalName, "Suseela Technologies Private Limited");
  assert.equal(p.company?.gstRegistered, false);
  assert.equal(p.brand?.name, "Suseela Caterings");
  assert.deepEqual(p.kitchensFor, ["br1"]);
  assert.deepEqual(p.storesFor, ["br1"]);
  const again = firstSetupPlan({ legalName: "x", brandName: "y", gstin: "", address: "", phone: "" }, branches, world);
  assert.equal(again.company, null, "run twice: nothing is made twice");
  assert.equal(again.brand, null);
  assert.deepEqual(again.kitchensFor, []);
});
