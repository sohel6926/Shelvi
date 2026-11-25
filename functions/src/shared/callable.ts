import { REGION } from "../setup";
import { onCall, CallableOptions, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { callableDecision } from "../roles/callablePerms";
import { requireActiveUser, assertRole, CallerContext, Role } from "../auth/authContext";
import { guard } from "./errors";
import { body } from "./validate";
import { Doc } from "./coerce";

export const ADMIN: readonly Role[] = ["admin"];
export const ADMIN_MANAGER: readonly Role[] = ["admin", "manager"];
export const ALL_ROLES: readonly Role[] = ["admin", "manager", "staff"];

/**
 * Defines a v2 callable in asia-south1: checks sign-in + active (requireActiveUser), checks the level AND the
 * caller's business role (Module 4d: roles/callablePerms.ts — `name` must be the export name, it is the key of the
 * permission table), validates the body is an object, and maps every error to HttpsError with { te, en } details.
 */
export function callable<Res>(
  name: string,
  roles: readonly Role[],
  handler: (data: Doc, caller: CallerContext, request: CallableRequest) => Promise<Res>,
  opts: CallableOptions = {},
) {
  return onCall({ region: REGION, ...opts }, (request: CallableRequest) =>
    guard(async () => {
      const caller = await requireActiveUser(request);
      const verdict = callableDecision(name, roles, caller.role, caller.jobRole);
      if (verdict === "deny-level") assertRole(caller, roles);
      if (verdict !== "allow") {
        throw new HttpsError("permission-denied", `Job role ${caller.jobRole} cannot do ${name}.`, {
          te: "మీ పని పాత్రకు ఈ పని చేసే అనుమతి లేదు. అవసరమైతే యజమానిని అడగండి.",
          en: "Your job role is not allowed to do this. Ask the owner if you need it.",
        });
      }
      return handler(body(request.data ?? {}), caller, request);
    }),
  );
}
