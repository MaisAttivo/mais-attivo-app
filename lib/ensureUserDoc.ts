import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";

/**
 * Cria/normaliza o documento users/{uid} com defaults.
 * roleHint: "client" por omissão; passa "coach" quando fizer sentido.
 */
export async function ensureUserDoc(
  user: User,
  roleHint: "coach" | "client" = "client"
) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email || "",
      role: roleHint,            // "client" ou "coach"
      objetivoPeso: "perda",     // default (mudas no check-in/perfil)
      lastCheckinDate: "",
      nextCheckinDate: "",
      createdAt: serverTimestamp(),
    });
  }
}
