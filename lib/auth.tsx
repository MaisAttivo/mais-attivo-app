// lib/auth.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter, usePathname } from "next/navigation";

export function useSession() {
  const [uid, setUid] = useState<string | null>(null);
  const [role, setRole] = useState<"client" | "coach" | null>(null);
  const [onboardingDone, setOnb] = useState<boolean | null>(null);
  const [active, setActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If Firebase isn't configured on client, avoid hanging UI
    if (!auth) { setUid(null); setRole(null); setOnb(null); setActive(null); setLoading(false); return; }

    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) { setUid(null); setRole(null); setOnb(null); setActive(null); setLoading(false); return; }
        setUid(u.uid);
        try {
          if (!db) throw new Error("db unavailable");
          const snap = await getDoc(doc(db, "users", u.uid));
          const data: any = snap.data() || {};
          setRole((data?.role as any) ?? "client");
          setOnb(!!data?.onboardingDone);
          setActive(typeof data?.active === "boolean" ? data.active : true);
        } catch {
          // If Firestore unavailable, still allow UI with minimal session
          setRole("client");
          setOnb(true);
          setActive(true);
        }
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  return { uid, role, onboardingDone, active, loading };
}

/** Guard para páginas de CLIENTE. Força onboarding se faltar. */
export function ClientGuard({ children }: { children: React.ReactNode }) {
  const { uid, role, onboardingDone, loading, active } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const redirected = useRef(false);

  useEffect(() => {
    if (loading || redirected.current) return;
    if (!uid) {
      if (pathname !== "/login") { redirected.current = true; router.replace("/login"); }
      return;
    }
    if (role === "coach") {
      if (pathname !== "/coach") { redirected.current = true; router.replace("/coach"); }
      return;
    }
    if (active === false) {
      if (pathname !== "/login") { redirected.current = true; router.replace("/login"); }
      return;
    }
    if (!onboardingDone && pathname !== "/onboarding") {
      redirected.current = true; router.replace("/onboarding");
      return;
    }
  }, [uid, role, onboardingDone, active, loading, pathname, router]);

  if (loading) return <div className="p-6">A verificar sessão…</div>;
  return <>{children}</>;
}

/** Guard para páginas do COACH. */
export function CoachGuard({ children }: { children: React.ReactNode }) {
  const { uid, role, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!uid) { router.replace("/login"); return; }
    if (role !== "coach") { router.replace("/dashboard"); }
  }, [uid, role, loading, router]);
  if (loading) return <div className="p-6">A verificar sessão…</div>;
  return <>{children}</>;
}
