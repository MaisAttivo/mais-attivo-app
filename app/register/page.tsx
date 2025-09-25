"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import PrivacyContent from "@/components/PrivacyContent";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [healthConsent, setHealthConsent] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

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
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }

      const userRef = doc(db, "users", cred.user.uid);
      await setDoc(userRef, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: (phone || "").toString().trim() || null,
        role: "client",
        onboardingDone: false,
        active: true,
        workoutFrequency: 0,
        metaAgua: null,
        privacyConsent: termsAccepted,
        healthDataExplicitConsent: healthConsent,
        imageUseConsent: false,
        imageUseSocialCensored: false,
        privacyConsentAt: serverTimestamp(),
        healthDataConsentAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        notificationsEnabled: true,
        devicePlatform: "web",
      });

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
              type="tel"
              placeholder="Telemóvel (ex.: 351912345678)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
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

            <label className="flex items-start gap-2 text-xs text-slate-700 mt-1">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <span>
                Li e aceito os {""}
                <button type="button" onClick={() => setShowTerms(true)} className="underline">
                  Termos & Política de Privacidade
                </button>
                .
              </span>
            </label>

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

      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowTerms(false)} />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-3xl max-h-[90dvh] flex flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-300"
          >
            <div className="flex items-center justify-between border-b px-4 py-3 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">Termos & Política de Privacidade</h2>
              <button
                type="button"
                aria-label="Fechar"
                className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100"
                onClick={() => setShowTerms(false)}
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <PrivacyContent />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
