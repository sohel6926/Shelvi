/** Shared helpers for the calculation engine. See docs/calc-spec.md. */
export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalcError";
  }
}

/** Round to 2 decimals, half away from zero (paise). */
export function round2(x: number): number {
  const s = Math.sign(x);
  // toPrecision(15) removes binary noise first, so 1.005 rounds to 1.01 as a person expects.
  const a = Number((Math.abs(x) * 100).toPrecision(15));
  return (s * Math.round(a)) / 100 || 0;
}

/** Round to whole number, half away from zero. */
export function roundHalfAway(x: number): number {
  const s = Math.sign(x);
  return s * Math.round(Number(Math.abs(x).toPrecision(15))) || 0;
}

export function ceilTol(x: number): number {
  return Math.ceil(x - 1e-9);
}

export function requireFinite(name: string, x: number): void {
  if (typeof x !== "number" || !Number.isFinite(x)) throw new CalcError(`${name} must be a finite number`);
}

export function requireNonNeg(name: string, x: number): void {
  requireFinite(name, x);
  if (x < 0) throw new CalcError(`${name} must not be negative`);
}

export function requirePositive(name: string, x: number): void {
  requireFinite(name, x);
  if (x <= 0) throw new CalcError(`${name} must be greater than 0`);
}

export type Band = "good" | "warn" | "bad";
