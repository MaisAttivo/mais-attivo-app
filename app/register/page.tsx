"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [healthConsent, setHealthConsent] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    if (!termsAccepted || !healthConsent) {
      setError(
        !termsAccepted && !healthConsent
          ? "Tens de aceitar os Termos & Política de Privacidade e dar consentimento explícito para tratamento de dados de saúde."
          : !termsAccepted
          ? "Tens de aceitar os Termos & Política de Privacidade."
          : "Tens de dar consentimento explícito para tratamento de dados de saúde."
      );
      setLoading(false);
      return;
    }

    try {
      // 1) Criar conta no Auth
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

      // 1.1) (Opcional) colocar o displayName no perfil Auth
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }

      // 2) Guardar documento em /users/{uid}
      const userRef = doc(db, "users", cred.user.uid);
      await setDoc(userRef, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: "client",
        onboardingDone: false,
        active: true,
        workoutFrequency: 0,
        metaAgua: null,
        // consentimentos (separados conforme a norma)
        privacyConsent: termsAccepted,
        healthDataExplicitConsent: healthConsent,
        imageUseConsent: false,
        imageUseSocialCensored: false,
        privacyConsentAt: serverTimestamp(),
        healthDataConsentAt: serverTimestamp(),
        // sistema
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        notificationsEnabled: true,
        devicePlatform: "web",
      });

      // 3) Ir para o onboarding (questionário inicial)
      router.replace("/onboarding");
    } catch (err: any) {
      const msg =
        err?.code === "auth/email-already-in-use"
          ? "Este email já está a ser usado."
          : err?.code === "auth/invalid-email"
          ? "Email inválido."
          : err?.code === "auth/weak-password"
          ? "Password fraca (mínimo 6 caracteres)."
          : "Ocorreu um erro a criar a conta.";
      setError(msg);
      console.error(err);
    } finally {
      setLoading(false);
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
          <h1 className="text-2xl font-semibold mb-4 text-slate-900">Criar conta</h1>

          <form onSubmit={handleRegister} className="grid gap-3">
            <input
              className="border border-slate-400 bg-white shadow-sm rounded px-3 py-2"
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="border border-slate-400 bg-white shadow-sm rounded px-3 py-2"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="border border-slate-400 bg-white shadow-sm rounded px-3 py-2"
              type="password"
              placeholder="Password (mín. 6)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />

            {/* 1) Termos & Privacidade (obrigatório) */}
            <label className="flex items-start gap-2 text-xs text-slate-700 mt-1">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <span>
                Li e aceito os {""}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                  Termos & Política de Privacidade
                </a>
                .
              </span>
            </label>

            {/* 2) Consentimento explícito para dados de saúde (obrigatório) */}
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={healthConsent}
                onChange={(e) => setHealthConsent(e.target.checked)}
              />
              <span>
                Dou o meu <strong>consentimento explícito</strong> para o tratamento dos meus <strong>dados de saúde</strong> (ex.: peso, medidas, composição corporal, rotinas) para fins de acompanhamento. Posso retirar este consentimento a qualquer momento.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 font-semibold text-white shadow-md hover:bg-[#BE9B2F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] disabled:opacity-60"
            >
              {loading ? "A criar..." : "Criar conta"}
            </button>
          </form>

          {error && <p className="text-red-600 mt-3">{error}</p>}

          <p className="mt-4 text-sm text-slate-600">
            Já tens conta? <a className="underline" href="/login">Inicia sessão</a>
          </p>
        </div>
      </div>
    </main>
  );
}
