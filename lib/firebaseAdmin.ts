import "server-only";

import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Initialize Admin SDK with explicit storage bucket
export const adminApp: App =
  getApps()[0] ||
  initializeApp({
    credential: applicationDefault(),
    storageBucket: "mais-attivo-ofc.appspot.com",
  });

export const adminDb = getFirestore(adminApp);
adminDb.settings({ ignoreUndefinedProperties: true });

// Export the bucket explicitly pointing to the correct bucket
export const bucket = getStorage(adminApp).bucket("mais-attivo-ofc.appspot.com");

// Temporary validation log
// eslint-disable-next-line no-console
console.log("[AdminStorage CHECK]", bucket.name);
