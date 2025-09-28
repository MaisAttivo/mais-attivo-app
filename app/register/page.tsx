"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import PrivacyContent from "@/components/PrivacyContent";

function AuthInstallPrompt() {
  const [installed, setInstalled] = useState(typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)")?.matches || (window.navigator as any).standalone));
  const [promptEvent, setPromptEvent] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [androidFallback, setAndroidFallback] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  function isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    const mql = window.matchMedia?.("(display-mode: standalone)")?.matches;
    const iosStandalone = (window.navigator as any).standalone;
    return Boolean(mql || iosStandalone);
  }
  function isIOS(): boolean {
    if (typeof navigator === "undefined") return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }
  function isSafari(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    const isChrome = /chrome|crios|crmo/i.test(ua);
    const isFirefox = /fxios/i.test(ua);
    return navigator.vendor === "Apple Computer, Inc." && !isChrome && !isFirefox;
  }
  function isAndroid(): boolean {
    if (typeof navigator === "undefined") return false;
    return /android/i.test(navigator.userAgent);
  }
  function isSamsungInternet(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("samsungbrowser");
  }
  async function hasServiceWorker(): Promise<boolean> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs && regs.length > 0;
    } catch {
      return false;
    }
  }
  function hasManifestLink(): boolean {
    if (typeof document === "undefined") return false;
    return !!document.querySelector('link[rel="manifest"]');
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    setInstalled(isStandalone());

    const onBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setPromptEvent(e);
      setCanInstall(true);
      setAndroidFallback(false);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setCanInstall(false);
      setAndroidFallback(false);
    };
    const onVisibility = () => setInstalled(isStandalone());

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (installed) return;

      if (isIOS() && isSafari()) {
        setAndroidFallback(false);
        return;
      }
      if (!isAndroid()) {
        setAndroidFallback(false);
        return;
      }
      if (canInstall && promptEvent) {
        setAndroidFallback(false);
        return;
      }

      const sw = await hasServiceWorker();
      const mf = hasManifestLink();
      const inBrowserMode = !isStandalone();
      if (!cancelled) setAndroidFallback(sw && mf && inBrowserMode);
    })();
    return () => { cancelled = true; };
  }, [installed, canInstall, promptEvent]);

  const handleInstall = async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    try { await promptEvent.userChoice; } finally {
      setPromptEvent(null);
      setCanInstall(false);
    }
  };

  if (installed) return null;

  if (canInstall && promptEvent && !isIOS()) {
    return (
      <button
        onClick={handleInstall}
        className="fixed bottom-4 right-4 z-50 rounded-xl bg-[#706800] text-white px-4 py-2 shadow-lg hover:bg-[#8c7c00]"
        aria-label="Instalar aplicação"
        title="Instalar aplicação"
      >
        Instalar App
      </button>
    );
  }

  if (isIOS() && isSafari() && !isStandalone()) {
    return (
      <div className="fixed bottom-4 inset-x-4 md:right-4 md:left-auto z-50 max-w-sm rounded-2xl bg-white shadow-lg ring-1 ring-black/10 p-4">
        <div className="flex items-start gap-3 text-slate-800">
          <div className="text-2xl" aria-hidden>📲</div>
          <div className="text-sm">
            <div className="font-semibold mb-1">Instalar no iPhone</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>Toque em <span className="font-medium">Partilhar</span> (ícone <span aria-hidden>⬆️</span> na barra inferior).</li>
              <li>Escolha <span className="font-medium">Adicionar ao Ecrã Principal</span>.</li>
              <li>Toque em <span className="font-medium">Adicionar</span>.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (androidFallback && !dismissed) {
    const samsung = isSamsungInternet();
    return (
      <div className="fixed bottom-4 inset-x-4 md:right-4 md:left-auto z-50 max-w-sm rounded-2xl bg-white shadow-lg ring-1 ring-black/10 p-4">
        <div className="flex items-start gap-3 text-slate-800">
          <div className="text-2xl" aria-hidden>📲</div>
          <div className="text-sm">
            <div className="font-semibold mb-1">Instalar no Android</div>
            {samsung ? (
              <ol className="list-decimal list-inside space-y-1">
                <li>Toque em <span className="font-medium">Menu</span> (<span aria-hidden>☰</span> ou <span aria-hidden>⋮</span>).</li>
                <li>Escolha <span className="font-medium">Adicionar página a</span> → <span className="font-medium">Ecrã inicial</span>.</li>
                <li>Confirme em <span className="font-medium">Adicionar</span>.</li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-1">
                <li>Toque em <span className="font-medium">Menu</span> (<span aria-hidden>⋮</span>).</li>
                <li>Escolha <span className="font-medium">Adicionar à página inicial</span> (ou <span className="font-medium">Instalar app</span>).</li>
                <li>Confirme em <span className="font-medium">Adicionar</span>.</li>
              </ol>
            )}
            <p className="text-xs text-slate-500 mt-2">Se não aparecer a opção, volta a esta página e tenta novamente.</p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto text-slate-500 hover:text-slate-700"
            aria-label="Fechar"
            title="Fechar"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
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
        phone: phoneLocal ? `+351${phoneLocal}` : null,
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
            <div className="flex">
              <span className="inline-flex items-center rounded-l border border-slate-400 bg-white px-3 select-none">+351</span>
              <input
                className="flex-1 border border-l-0 border-slate-400 bg-white shadow-sm rounded-r px-3 py-2"
                type="tel"
                placeholder="9XXXXXXXX"
                value={phoneLocal}
                onChange={(e) => {
                  const raw = e.target.value;
                  const digits = raw.replace(/\D/g, "");
                  let local = digits;
                  if (local.startsWith("00351")) local = local.slice(5);
                  else if (local.startsWith("351")) local = local.slice(3);
                  if (local.startsWith("0")) local = local.replace(/^0+/, "");
                  setPhoneLocal(local.slice(0, 9));
                }}
                inputMode="tel"
              />
            </div>
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
      <AuthInstallPrompt />
    </main>
  );
}
