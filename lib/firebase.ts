// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

let appInstance: any, authInstance: any, dbInstance: any, storageInstance: any;

if (typeof window !== "undefined") {
  const storageBucket =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "mais-attivo-ofc.firebasestorage.app";

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket, // <- firebasestorage.app
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  } as const;

  appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  authInstance = getAuth(appInstance);
  try { setPersistence(authInstance, browserLocalPersistence); } catch {}
  dbInstance = initializeFirestore(appInstance, { experimentalForceLongPolling: true });
  storageInstance = getStorage(appInstance, `gs://${storageBucket}`);
}

export const app = appInstance as any;
export const auth = authInstance as any;
export const db = dbInstance as any;
export const storage = storageInstance as any;
