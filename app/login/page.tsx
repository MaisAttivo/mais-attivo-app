"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureUserDoc } from "@/lib/ensureUserDoc";
import { useSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { uid, role, onboardingDone, active, loading } = useSession();

  useEffect(() => {
    if (submitting) return;
    if (uid) {
      if (active === false && role !== "coach") return; // deixa RootLayout mostrar aviso de conta inativa
      if (role === "coach") { router.replace("/coach"); return; }
      if (!onboardingDone) { router.replace("/onboarding"); return; }
      router.replace("/dashboard");
    }
  }, [uid, role, onboardingDone, active, loading, router]);

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMsg(null);
    setResetError(null);

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);

      // ✅ NÃO passes `db` aqui. Só (user, "client")
      const udoc = await ensureUserDoc(cred.user, "client");

      if (udoc.role === "coach") {
        router.replace("/coach");
      } else if (!udoc.onboardingDone) {
        router.replace("/onboarding");
      } else {
        router.replace("/dashboard");
      }
    } catch (err: any) {
      console.error(err);
      const code = err?.code || "";
      const pretty =
        code === "auth/invalid-credential"
          ? "Email ou palavra-passe inválidos."
          : code === "auth/too-many-requests"
          ? "Muitas tentativas. Tenta mais tarde."
          : "Falha no login. Verifica os dados.";
      setMsg(`❌ ${pretty}`);
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-[#FFF7E8] to-[#F9F0CF]">
      <div className="w-full max-w-md p-6">
        <img
          src="https://cdn.builder.io/api/v1/image/assets%2Fd9f69681ad0a4f6986049fd020072c56%2Fb8f25fb491154d179da1f49a2fc6b90e?format=webp&width=1200"
          alt="Mais Attivo"
          className="block mb-2 w-[115%] sm:w-[125%] max-w-none -mx-[7.5%] sm:-mx-[12.5%] h-auto"
        />
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-slate-300 p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Entrar
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Usa o teu e-mail e palavra-passe para aceder.
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-800">
                Email
              </label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition"
                placeholder="ex: joao@exemplo.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800">
                Palavra-passe
              </label>
              <div className="relative mt-1">
                <input
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2 pr-12 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs text-slate-700 hover:bg-slate-200"
                  aria-label={showPass ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                >
                  {showPass ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            {msg && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {msg}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={async () => {
                  setResetError(null);
                  if (!email.trim()) { setResetError("Indica o teu email em cima."); return; }
                  try {
                    await sendPasswordResetEmail(auth, email.trim());
                    setResetOpen(true);
                  } catch (e: any) {
                    setResetError("Não foi possível enviar. Verifica o email.");
                  }
                }}
                className="text-sm underline text-slate-700 hover:text-slate-900"
              >
                Esqueci-me da palavra‑passe
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-[#D4AF37] px-4 py-2.5 font-semibold text-white shadow hover:bg-[#BE9B2F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {submitting ? "A entrar…" : "Entrar"}
              </button>
            </div>
          </form>

          {resetError && <p className="mt-3 text-xs text-rose-700">{resetError}</p>}

          <div className="mt-6 pt-4 border-t border-slate-200 text-center">
            <p className="text-sm text-slate-700">Ainda não tens conta?</p>
            <button
              type="button"
              onClick={() => router.push("/register")}
              className="mt-3 rounded-xl bg-[#D4AF37] px-4 py-2.5 font-semibold text-white shadow hover:bg-[#BE9B2F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
            >
              Criar conta
            </button>
          </div>
        </div>
      </div>

      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="rounded-2xl bg-white shadow-xl ring-1 ring-slate-300 p-6 max-w-sm w-full text-center">
            <h2 className="text-lg font-semibold mb-1">Email enviado</h2>
            <p className="text-sm text-slate-700">
              Enviámos um email para redefinir a palavra‑passe. Verifica também a pasta de SPAM/Lixo.
            </p>
            <button
              type="button"
              onClick={() => setResetOpen(false)}
              className="mt-4 rounded-xl bg-[#D4AF37] px-4 py-2.5 font-semibold text-white shadow hover:bg-[#BE9B2F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
