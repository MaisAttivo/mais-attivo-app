"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureUserDoc } from "@/lib/ensureUserDoc";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setMsg(null);

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
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md p-6">
        <div className="rounded-2xl bg-white/90 shadow-xl ring-1 ring-slate-200 p-6">
          <img
            src="https://cdn.builder.io/api/v1/image/assets%2Fd9f69681ad0a4f6986049fd020072c56%2Fc8f64e36febe4c2391d98a7f535b326a?format=webp&width=800"
            alt="Mais Attivo"
            className="mx-auto mb-4 h-10 w-auto"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Entrar
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Usa o teu e-mail e palavra-passe para aceder.
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition"
                placeholder="ex: joao@exemplo.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Palavra-passe
              </label>
              <div className="relative mt-1">
                <input
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-12 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs text-slate-600 hover:bg-slate-100"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#D4AF37] px-4 py-2.5 font-semibold text-white shadow hover:bg-[#BE9B2F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? "A entrar…" : "Entrar"}
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-500">
            Dica: confirma no Firebase Auth que o método Email/Password está ativo.
          </p>
        </div>
      </div>
    </main>
  );
}
