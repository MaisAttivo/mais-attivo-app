// lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Initialize Firebase only in the browser to avoid SSR crashes when env vars are missing
let appInstance: any = undefined;
let authInstance: any = undefined;
let dbInstance: any = undefined;
let storageInstance: any = undefined;

if (typeof window !== "undefined") {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  } as const;

  // Only attempt initialization if required keys exist on the client
  const hasAllKeys = Object.values(firebaseConfig).every((v) => typeof v === "string" && v.length > 0);

  if (hasAllKeys) {
    appInstance = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    authInstance = getAuth(appInstance);
    dbInstance = initializeFirestore(appInstance, { experimentalAutoDetectLongPolling: true });

    // Explicitly select the bucket only if it's valid; ignore firebasestorage.app hostnames
    const bucket = (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
    let gsUrl: string | undefined = undefined;
    if (bucket) {
      const isValid = bucket.startsWith("gs://") || bucket.endsWith(".appspot.com");
      if (isValid) gsUrl = bucket.startsWith("gs://") ? bucket : `gs://${bucket}`;
    }
    try {
      storageInstance = gsUrl ? getStorage(appInstance, gsUrl) : getStorage(appInstance);
    } catch {
      storageInstance = getStorage(appInstance);
    }
  } else {
    if (process.env.NODE_ENV !== "production") {
      // Surface a helpful warning in dev instead of crashing the server render
      // eslint-disable-next-line no-console
      console.warn("Firebase config is missing. Set NEXT_PUBLIC_FIREBASE_* env variables to enable auth and database.");
    }
  }
}

export const app = appInstance as any;
export const auth = authInstance as any;
export const db = dbInstance as any;
export const storage = storageInstance as any;
