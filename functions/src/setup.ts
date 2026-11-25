/**
 * Runs once, before any function is defined: region + Admin SDK init.
 * Every module that defines a function imports this file first, so the region applies everywhere.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";

export const REGION = "asia-south1";
export const TIME_ZONE = "Asia/Kolkata";

setGlobalOptions({ region: REGION });
if (getApps().length === 0) initializeApp();
