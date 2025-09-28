"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureUserDoc } from "@/lib/ensureUserDoc";
import { useSession } from "@/lib/auth";

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
  const formRef = useRef<HTMLFormElement | null>(null);

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

          <form ref={formRef} onSubmit={handleLogin} className="mt-6 space-y-4">
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
                aria-busy={submitting}
                onClick={(e) => {
                  if (submitting) { e.preventDefault(); return; }
                  const form = formRef.current;
                  if (form && !form.checkValidity()) {
                    e.preventDefault();
                    form.reportValidity();
                  }
                }}
                className="rounded-xl bg-[#D4AF37] px-4 py-2.5 font-semibold text-white shadow hover:bg-[#BE9B2F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] active:scale-95 active:ring-2 active:ring-[#D4AF37] disabled:opacity-60 disabled:cursor-not-allowed transition-transform transition-colors"
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
      <AuthInstallPrompt />
    </main>
  );
}
