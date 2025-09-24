"use client";
import { useEffect } from "react";

export default function OneSignalInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Carregar o SDK se ainda não estiver presente
    if (!(window as any).OneSignal) {
      const s = document.createElement("script");
      s.src = "https://cdn.onesignal.com/sdks/OneSignalSDK.js";
      s.async = true;
      document.head.appendChild(s);
    }

    (window as any).OneSignal = (window as any).OneSignal || [];
    (window as any).OneSignal.push(function () {
      (window as any).OneSignal.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true, // útil em dev local
        notifyButton: { enable: false },    // vamos usar o nosso botão
        serviceWorkerPath: "/OneSignalSDKWorker.js",
        serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
        serviceWorkerParam: { scope: "/" },
      });
    });
  }, []);

  return null;
}
