"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth";

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

export default function InstallPrompt() {
  const pathname = usePathname();
  const { role } = useSession();

  // só no dashboard do cliente
  const onDashboard = pathname === "/dashboard";
  const isClient = role === "client";

  const [installed, setInstalled] = useState(isStandalone());
  const [promptEvent, setPromptEvent] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [androidFallback, setAndroidFallback] = useState(false); // Samsung/Android fallback
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setInstalled(isStandalone());

    const onBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setPromptEvent(e);
      setCanInstall(true);
      setAndroidFallback(false); // se o evento existe, não precisamos de fallback
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

  // Fallback para Android/Samsung: se não há prompt mas parece instalável → mostrar instruções
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!onDashboard || !isClient) return;
      if (installed) return;

      // iOS tem o banner próprio (não misturar com fallback Android)
      if (isIOS() && isSafari()) {
        setAndroidFallback(false);
        return;
      }

      // só considerar fallback em Android
      if (!isAndroid()) {
        setAndroidFallback(false);
        return;
      }

      // Se já temos prompt, não precisa de fallback
      if (canInstall && promptEvent) {
        setAndroidFallback(false);
        return;
      }

      // Heurística de "instalável": SW + manifest + modo browser
      const sw = await hasServiceWorker();
      const mf = hasManifestLink();
      const inBrowserMode = !isStandalone();

      if (!cancelled) {
        setAndroidFallback(sw && mf && inBrowserMode);
      }
    })();
    return () => { cancelled = true; };
  }, [onDashboard, isClient, installed, canInstall, promptEvent]);

  const handleInstall = async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    try { await promptEvent.userChoice; } finally {
      setPromptEvent(null);
      setCanInstall(false);
    }
  };

  if (!onDashboard || !isClient) return null;
  if (installed) return null;

  // Caso 1: Browsers com prompt nativo (Chrome/Edge/Android/desktop)
  if (canInstall && promptEvent && !isIOS()) {
    return (
      <button
        onClick={handleInstall}
        className="fixed top-4 right-4 z-50 rounded-xl bg-[#706800] text-white px-4 py-2 shadow-lg hover:bg-[#8c7c00]"
        aria-label="Instalar aplicação"
        title="Instalar aplicação"
      >
        Instalar App
      </button>
    );
  }

  // Caso 2: iOS Safari — instruções
  if (isIOS() && isSafari() && !isStandalone()) {
    return (
      <div className="fixed top-4 inset-x-4 md:right-4 md:left-auto z-50 max-w-sm rounded-2xl bg-white shadow-lg ring-1 ring-black/10 p-4">
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
          {/* iOS: podes fechar, volta a aparecer no próximo login se ainda não tiver instalada */}
        </div>
      </div>
    );
  }

  // Caso 3: ANDROID fallback (ex.: Samsung Internet)
  if (androidFallback && !dismissed) {
    const samsung = isSamsungInternet();
    return (
      <div className="fixed top-4 inset-x-4 md:right-4 md:left-auto z-50 max-w-sm rounded-2xl bg-white shadow-lg ring-1 ring-black/10 p-4">
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
