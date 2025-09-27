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
  // Safari iOS/mac: vendor é Apple e não é Chrome/Firefox
  return navigator.vendor === "Apple Computer, Inc." && !isChrome && !isFirefox;
}

const DISMISS_KEY = "install_prompt_dismissed_v1";

export default function InstallPrompt() {
  const pathname = usePathname();
  const { role } = useSession();

  const [promptEvent, setPromptEvent] = useState<any>(null);
  const [installed, setInstalled] = useState<boolean>(false);
  const [canInstall, setCanInstall] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  const onDashboard = pathname === "/dashboard";
  const isClient = role === "client";

  useEffect(() => {
    if (typeof window === "undefined") return;

    setInstalled(isStandalone());
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");

    const onBeforeInstallPrompt = (e: any) => {
      // apenas browsers com prompt
      e.preventDefault();
      setPromptEvent(e);
      setCanInstall(true);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setCanInstall(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    const onVisibility = () => setInstalled(isStandalone());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const handleInstall = async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    try {
      await promptEvent.userChoice; // { outcome: 'accepted' | 'dismissed' }
    } finally {
      setPromptEvent(null);
      setCanInstall(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  // regras globais
  if (!onDashboard || !isClient) return null; // só no dashboard do cliente
  if (installed) return null;                  // se já estiver instalada, não mostra
  if (dismissed) return null;                  // se o user dispensou, não mostra

  // caso 1: browsers com prompt nativo
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

  // caso 2: iOS Safari — mostrar instruções
  if (isIOS() && isSafari() && !isStandalone()) {
    return (
      <div className="fixed bottom-4 inset-x-4 md:right-4 md:left-auto z-50 max-w-sm rounded-2xl bg-white shadow-lg ring-1 ring-black/10 p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl" aria-hidden>📲</div>
          <div className="text-sm text-slate-800">
            <div className="font-semibold mb-1">Instalar no iPhone</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>Toque em <span className="font-medium">Partilhar</span> (ícone <span aria-hidden>⬆️</span> na barra inferior).</li>
              <li>Escolha <span className="font-medium">Adicionar ao Ecrã Principal</span>.</li>
              <li>Toque em <span className="font-medium">Adicionar</span>.</li>
            </ol>
          </div>
          <button
            onClick={handleDismiss}
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

  // outros casos: não mostrar nada
  return null;
}
