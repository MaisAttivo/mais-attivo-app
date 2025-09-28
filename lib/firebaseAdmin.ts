// lib/firebaseAdmin.ts
import "server-only";
import { getApps, initializeApp, type App, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const SERVICE_ACCOUNT_JSON =
  process.env.FIREBASE_ADMIN_SA_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;

if (!SERVICE_ACCOUNT_JSON) {
  throw new Error("Service account em falta (FIREBASE_ADMIN_SA_JSON).");
}

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  "mais-attivo-ofc.firebasestorage.app";

export const adminApp: App =
  getApps()[0] ||
  initializeApp({
    credential: cert(JSON.parse(SERVICE_ACCOUNT_JSON)),
    storageBucket: STORAGE_BUCKET,
  });

export const adminDb = getFirestore(adminApp);
adminDb.settings({ ignoreUndefinedProperties: true });

export const bucket = getStorage(adminApp).bucket(STORAGE_BUCKET);
