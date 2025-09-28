"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function CoachGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const redirected = useRef(false); // evita vários replace() em SSR/fast refresh

  const [state, setState] = useState<{ checking: boolean; allowed: boolean }>({
    checking: true,
    allowed: false,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setState({ checking: false, allowed: false });
        if (!redirected.current) {
          redirected.current = true;
          router.replace("/login");
        }
        return;
      }

      // Verifica apenas via Firestore (role no documento do utilizador)
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const role = snap.exists() ? (snap.get("role") as string | undefined) : undefined;
        const ok = role === "coach" || role === "admin";
        setState({ checking: false, allowed: ok });
        if (!ok && !redirected.current) {
          redirected.current = true;
          router.replace("/");
        }
      } catch {
        setState({ checking: false, allowed: false });
        if (!redirected.current) {
          redirected.current = true;
          router.replace("/");
        }
      }
    });

    return () => unsub();
  }, [router]);

  if (state.checking) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-sm text-muted-foreground">
        <div className="animate-spin h-5 w-5 rounded-full border-2 border-muted-foreground border-t-transparent mr-3" />
        A validar permissões…
      </div>
    );
  }

  return state.allowed ? <>{children}</> : null;
}
