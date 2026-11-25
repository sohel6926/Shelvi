import { HttpsError, FunctionsErrorCode } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { CalcError } from "../calc/util";

/** Every error a client sees carries details = { te, en } (docs/api-contract.md). */
export interface Bilingual {
  te: string;
  en: string;
}

export function fail(code: FunctionsErrorCode, te: string, en: string): never {
  throw new HttpsError(code, en, { te, en });
}

const GENERIC_TE: Partial<Record<FunctionsErrorCode, string>> = {
  "invalid-argument": "నమోదు చేసిన వివరాలు సరిగా లేవు.",
  "permission-denied": "ఈ పని చేయడానికి మీకు అనుమతి లేదు.",
  "not-found": "ఆ వివరాలు దొరకలేదు.",
  "failed-precondition": "ఈ పని ఇప్పుడు చేయలేము.",
  unauthenticated: "ముందు sign in చేయండి.",
  "already-exists": "ఇది ఇప్పటికే ఉంది.",
  aborted: "ఒకేసారి చాలా మార్పులు వచ్చాయి. మళ్ళీ ప్రయత్నించండి.",
  internal: "Server లో సమస్య వచ్చింది. కాసేపటి తర్వాత మళ్ళీ ప్రయత్నించండి.",
};

function hasBilingualDetails(details: unknown): boolean {
  return typeof details === "object" && details !== null && typeof (details as { te?: unknown }).te === "string";
}

/** Maps anything thrown inside a function to an HttpsError with Telugu + English details. */
export function toHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) {
    if (hasBilingualDetails(err.details)) return err;
    return new HttpsError(err.code, err.message, { te: GENERIC_TE[err.code] ?? GENERIC_TE.internal, en: err.message });
  }
  if (err instanceof CalcError) {
    return new HttpsError("invalid-argument", err.message, {
      te: `అంకెలు సరిగా లేవు: ${err.message}`,
      en: err.message,
    });
  }
  logger.error("Unexpected error", err);
  return new HttpsError("internal", "Something went wrong on the server.", {
    te: GENERIC_TE.internal as string,
    en: "Something went wrong on the server.",
  });
}

export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toHttpsError(e);
  }
}
