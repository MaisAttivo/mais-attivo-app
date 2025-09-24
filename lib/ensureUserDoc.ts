// lib/ensureUserDoc.ts
import { User } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Role = "client" | "coach";

export async function ensureUserDoc(
  user: User,
  fallbackRole: Role = "client"
): Promise<{
  id: string;
  email?: string;
  name?: string;
  role: Role;
  onboardingDone: boolean;
  workoutFrequency?: number | null;
  metaAgua?: number | null;
}> {
  const ref = doc(db, "users", user.uid);
  let snap: any;
  try {
    snap = await getDoc(ref);
  } catch (e) {
    // Network/Firestore unavailable — continue with defaults to avoid blocking login
    return {
      id: user.uid,
      email: user.email || "",
      name: user.displayName || "",
      role: fallbackRole,
      onboardingDone: false,
      workoutFrequency: 0,
      metaAgua: null,
    };
  }
  const nowDefaults = {
    email: user.email || "",
    name: user.displayName || "",
    role: fallbackRole,
    onboardingDone: false,
    active: true,
    workoutFrequency: 0,
    metaAgua: null as number | null,
  };

  // CREATE (se não existir) — não deita o login abaixo se as regras bloquearem
  if (!snap.exists()) {
    const payload = {
      ...nowDefaults,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      notificationsEnabled: true,
      devicePlatform: "web",
      active: true,
    };
    try {
      await setDoc(ref, payload);
    } catch (e) {
      // sem permissões para escrever — segue com defaults
      console.warn("[ensureUserDoc] setDoc bloqueado pelas regras:", e);
    }
    // tenta reler; se não houver, devolve defaults
    const afterCreate = await getDoc(ref);
    const data: any = afterCreate.exists() ? afterCreate.data() : payload;
    return {
      id: user.uid,
      email: data?.email ?? nowDefaults.email,
      name: data?.name ?? nowDefaults.name,
      role: (data?.role as Role) ?? nowDefaults.role,
      onboardingDone: !!data?.onboardingDone,
      workoutFrequency: data?.workoutFrequency ?? 0,
      metaAgua: data?.metaAgua ?? null,
    };
  }

  // UPDATE (normalização) — silencioso se falhar
  const data: any = snap.data() || {};
  const patch: any = {};
  if (data.role !== "client" && data.role !== "coach") patch.role = fallbackRole;
  if (typeof data.onboardingDone !== "boolean") patch.onboardingDone = false;
  if (!("workoutFrequency" in data)) patch.workoutFrequency = 0;
  if (!("metaAgua" in data)) patch.metaAgua = null;

  if (typeof data.active !== "boolean") patch.active = true;

  if (Object.keys(patch).length) {
    patch.updatedAt = serverTimestamp();
    try {
      await updateDoc(ref, patch);
    } catch (e) {
      console.warn("[ensureUserDoc] updateDoc bloqueado pelas regras:", e);
    }
  }

  // devolve o que houver (com defaults de fallback)
  const after = (await getDoc(ref)).data() as any || data;
  return {
    id: user.uid,
    email: after?.email ?? nowDefaults.email,
    name: after?.name ?? nowDefaults.name,
    role: (after?.role as Role) ?? nowDefaults.role,
    onboardingDone: !!after?.onboardingDone,
    workoutFrequency: after?.workoutFrequency ?? 0,
    metaAgua: after?.metaAgua ?? null,
  };
}
