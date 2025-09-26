import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Parse service account JSON from env (provided in hosting environment)
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
let credentials: { project_id?: string; client_email?: string; private_key?: string } | undefined;
try {
  credentials = raw ? JSON.parse(raw) : undefined;
} catch {
  credentials = undefined;
}

export const adminApp: App =
  getApps()[0] ||
  initializeApp({
    // If credentials are missing, Firebase Admin will try ADC/emulators where applicable
    credential: credentials ? cert({
      projectId: credentials.project_id,
      clientEmail: credentials.client_email,
      privateKey: credentials.private_key,
    }) : undefined,
    projectId: credentials?.project_id,
  });

export const adminDb = getFirestore(adminApp);
adminDb.settings({ ignoreUndefinedProperties: true });
