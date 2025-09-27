"use client";

import { useEffect, useState } from "react";

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      console.log("App instalada com sucesso!");
    } else {
      console.log("Utilizador rejeitou a instalação");
    }
    setDeferredPrompt(null);
    setCanInstall(false);
  };

  if (!canInstall) return null;

  return (
    <button
      onClick={handleInstall}
      className="fixed bottom-4 right-4 rounded-xl bg-[#706800] text-white px-4 py-2 shadow-lg hover:bg-[#8c7c00]"
    >
      Instalar App
    </button>
  );
}
