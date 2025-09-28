// lib/firebaseAdmin.ts
import "server-only";

import { getApps, initializeApp, type App, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_ADMIN_SA_JSON;
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "mais-attivo-ofc.appspot.com";

if (!SERVICE_ACCOUNT_JSON) {
  throw new Error(
    "FIREBASE_ADMIN_SA_JSON ausente. Define-a na Vercel com o JSON da service account."
  );
}

export const adminApp: App =
  getApps()[0] ||
  initializeApp({
    credential: cert(JSON.parse(SERVICE_ACCOUNT_JSON)),
    storageBucket: STORAGE_BUCKET,
  });

export const adminDb = getFirestore(adminApp);
adminDb.settings({ ignoreUndefinedProperties: true });

// Usa SEMPRE o bucket correto
export const bucket = getStorage(adminApp).bucket(STORAGE_BUCKET);

// (Opcional) log temporário – remove depois de validar nos logs da Vercel
// eslint-disable-next-line no-console
console.log("[AdminStorage CHECK]", bucket.name);
