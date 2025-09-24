"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const { uid, role, onboardingDone, active, loading } = useSession();
  const redirected = useRef(false);

  useEffect(() => {
    if (loading || redirected.current) return;

    // Sem sessão → login
    if (!uid) {
      redirected.current = true;
      router.replace("/login");
      return;
    }

    // Conta inativa: deixa o RootLayout mostrar o aviso
    if (active === false && role !== "coach") return;

    // Role/estado
    if (role === "coach") {
      redirected.current = true;
      router.replace("/coach");
      return;
    }
    if (!onboardingDone) {
      redirected.current = true;
      router.replace("/onboarding");
      return;
    }

    redirected.current = true;
    router.replace("/dashboard");
  }, [uid, role, onboardingDone, active, loading, router]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center">
      <div className="text-sm text-slate-600">A redirecionar…</div>
    </main>
  );
}
