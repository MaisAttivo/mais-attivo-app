"use client";

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setResetMsg(null);
    setLoading(true);
    if (!consent) { setError("Tens de aceitar a política de privacidade e uso de imagem."); setLoading(false); return; }

    try {
      // 1) Criar conta no Auth
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      // 1.1) (Opcional) colocar o displayName no perfil Auth
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }

      // 2) Guardar documento em /users/{uid}
      const userRef = doc(db, "users", cred.user.uid);
      await setDoc(userRef, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: "client",                // nunca permitir definir "coach" no frontend
        onboardingDone: false,         // <- importante para o guard enviar p/ onboarding
        active: true,                  // conta ativa por omissão
        // defaults úteis para o resto da app (podem ser ajustados no onboarding)
        workoutFrequency: 0,
        metaAgua: null,
        // consentimentos
        privacyConsent: true,
        imageUseConsent: true,
        imageUseSocialCensored: true,
        privacyConsentAt: serverTimestamp(),
        // campos de sistema
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

            <label className="flex items-start gap-2 text-xs text-slate-700 mt-1">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                Li e aceito a Política de Privacidade e a utilização de imagem: os dados são tratados segundo a lei portuguesa e as imagens que nos forneceres são privadas; poderão ser usadas nas redes sociais com a cara censurada, a menos que peças o contrário.
              </span>
            </label>

            <div className="flex items-center justify-between mt-1">
              <button
                type="button"
                onClick={async () => {
                  setResetMsg(null);
                  if (!email.trim()) { setResetMsg("Indica o teu email acima."); return; }
                  try {
                    await sendPasswordResetEmail(auth, email.trim());
                    setResetMsg("Enviámos um email para redefinir a palavra‑passe.");
                  } catch (e: any) {
                    setResetMsg("Não foi possível enviar. Verifica o email.");
                  }
                }}
                className="text-sm underline text-slate-700 hover:text-slate-900"
              >
                Esqueci-me da palavra‑passe
              </button>

              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-[#D4AF37] px-4 py-2.5 font-semibold text-white shadow-md hover:bg-[#BE9B2F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] disabled:opacity-60"
              >
                {loading ? "A criar..." : "Criar conta"}
              </button>
            </div>
          </form>

          {resetMsg && <p className="text-xs text-slate-700 mt-2">{resetMsg}</p>}
          {error && <p className="text-red-600 mt-3">{error}</p>}

          <p className="mt-4 text-sm text-slate-600">
            Já tens conta?{" "}
            <a className="underline" href="/login">
              Inicia sessão
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
