import { CalcError, requireFinite, requireNonNeg, round2 } from "./util";

export interface InvoiceTotals {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
}

/** Spec §1. Discount reduces the taxable value; tax is charged on (subtotal − discount). */
export function invoiceTotals(subtotal: number, gstRate: number, isInterState: boolean, discount = 0): InvoiceTotals {
  requireNonNeg("subtotal", subtotal);
  requireNonNeg("discount", discount);
  requireFinite("gstRate", gstRate);
  if (typeof isInterState !== "boolean") throw new CalcError("isInterState must be true or false");
  if (gstRate < 0 || gstRate > 28) throw new CalcError("gstRate must be between 0 and 28");
  const taxable = round2(Math.max(0, subtotal - discount));
  const tax = round2((taxable * gstRate) / 100);
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (isInterState) {
    igst = tax;
  } else {
    cgst = round2(tax / 2);
    sgst = round2(tax - cgst);
  }
  return { taxable, cgst, sgst, igst, tax, total: round2(taxable + tax) };
}
