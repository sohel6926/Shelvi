import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
/** All callables (including adjustStock) run in asia-south1 — docs/api-contract.md decision 9. */
export const functions = getFunctions(firebaseApp, "asia-south1");
export const storage = getStorage(firebaseApp);

/**
 * Test mode on the owner's Mac (`npm run dev:emulator`): everything talks to the local Firebase
 * emulators instead of the real project — no internet, no cost, nothing live.
 */
if (import.meta.env.VITE_USE_EMULATORS === "1") {
  // Same address as the page; vite.config.ts forwards each path to its local emulator.
  const host = window.location.hostname;
  const port = Number(window.location.port || 80);
  connectAuthEmulator(auth, window.location.origin, { disableWarnings: true });
  connectFirestoreEmulator(db, host, port);
  connectFunctionsEmulator(functions, host, port);
  connectStorageEmulator(storage, host, port);
}
