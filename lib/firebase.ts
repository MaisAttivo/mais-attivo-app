// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Inicializar Firebase só no browser para evitar crashes em SSR quando faltam envs
let appInstance: any = undefined;
let authInstance: any = undefined;
let dbInstance: any = undefined;
let storageInstance: any = undefined;

if (typeof window !== "undefined") {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    // Forçar o bucket correto independentemente de envs antigas
    storageBucket: "mais-attivo-ofc.appspot.com",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  } as const;

  appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);

  authInstance = getAuth(appInstance);
  try {
    // Garantir que a sessão persiste após fechar o browser
    // (não bloquear UI se falhar por políticas do navegador)
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    setPersistence(authInstance, browserLocalPersistence);
  } catch {}

  // Forçar long polling para evitar issues de rede/firewall em alguns ambientes
  dbInstance = initializeFirestore(appInstance, { experimentalForceLongPolling: true });

  // Forçar explicitamente o bucket correto (ignora configs herdadas erradas)
  storageInstance = getStorage(appInstance, "gs://mais-attivo-ofc.appspot.com");

  // (Opcional) Log temporário de validação — comentar/remover após verificar nos logs
  // eslint-disable-next-line no-console
  console.log("[Storage CHECK]", (storageInstance as any)?.app?.options?.storageBucket);
}

export const app = appInstance as any;
export const auth = authInstance as any;
export const db = dbInstance as any;
export const storage = storageInstance as any;
