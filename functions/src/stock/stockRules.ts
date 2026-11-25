import { asObj, Doc } from "../shared/coerce";

/** Should the trigger deduct now? Status became Completed and there is no live deduction. */
export function shouldAutoDeduct(before: Doc | undefined, after: Doc | undefined, autoStockDeduct: boolean): boolean {
  if (!autoStockDeduct || !after || after.status !== "Completed" || before?.status === "Completed") return false;
  const sd = asObj(after.stockDeduction);
  return !after.stockDeduction || sd.reversed === true;
}
