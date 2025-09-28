// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Initialize Firebase only in the browser to avoid SSR crashes when env vars are missing
let appInstance: any = undefined;
let authInstance: any = undefined;
let dbInstance: any = undefined;
let storageInstance: any = undefined;

if (typeof window !== "undefined") {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    // Force the correct bucket regardless of older envs/configs
    storageBucket: "mais-attivo-ofc.appspot.com",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  } as const;

  appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  authInstance = getAuth(appInstance);
  try {
    // Garantir sessão persiste após fechar o browser
    // Nota: não bloquear UI se falhar (navegador sem storage)
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    setPersistence(authInstance, browserLocalPersistence);
  } catch {}
  dbInstance = initializeFirestore(appInstance, { experimentalForceLongPolling: true });

  // Force the correct bucket (ignores outdated configs)
  storageInstance = getStorage(appInstance, "gs://mais-attivo-ofc.appspot.com");
  // Temporary validation log
  // eslint-disable-next-line no-console
  console.log("[Storage CHECK]", (storageInstance as any)?.app?.options?.storageBucket);
}

export const app = appInstance as any;
export const auth = authInstance as any;
export const db = dbInstance as any;
export const storage = storageInstance as any;
