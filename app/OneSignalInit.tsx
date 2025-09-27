"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth";

const OS_SDK_URL = "https://cdn.onesignal.com/sdks/OneSignalSDK.js";

export default function OneSignalInit() {
  const { uid } = useSession();

  // Carrega o SDK e faz init (uma vez)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) {
      console.warn("OneSignal: NEXT_PUBLIC_ONESIGNAL_APP_ID em falta");
      return;
    }

    const w = window as any;
    w.OneSignal = w.OneSignal || [];
    const Q = w.OneSignal as any[];

    // agenda o init para quando o SDK estiver pronto
    Q.push(function initOS() {
      try {
        w.OneSignal.init({
          appId,
          allowLocalhostAsSecureOrigin: true,
          notifyButton: { enable: false },

          // usa o teu SW único (PWA + OneSignal)
          serviceWorkerPath: "/sw.js",
          serviceWorkerUpdaterPath: "/sw.js",
          serviceWorkerParam: { scope: "/" },
        });
      } catch (e) {
        console.error("OneSignal init error:", e);
      }
    });

    // injeta o script se ainda não existir
    if (!document.querySelector(`script[src="${OS_SDK_URL}"]`)) {
      const s = document.createElement("script");
      s.src = OS_SDK_URL;
      s.async = true;
      document.head.appendChild(s);
    }
  }, []);

  // Liga/desliga o utilizador atual ao device (external_id + tag uid)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    w.OneSignal = w.OneSignal || [];
    w.OneSignal.push(async () => {
      const OS = w.OneSignal;
      try {
        if (uid) {
          if (typeof OS?.login === "function") await OS.login(uid);
          else if (typeof OS?.setExternalUserId === "function") await OS.setExternalUserId(uid);

          if (OS?.User?.addTag) await OS.User.addTag("uid", uid);
          else if (typeof OS?.sendTag === "function") await OS.sendTag("uid", uid);
        } else {
          if (typeof OS?.logout === "function") await OS.logout();
          else if (typeof OS?.removeExternalUserId === "function") await OS.removeExternalUserId();

          if (OS?.User?.removeTag) await OS.User.removeTag("uid");
        }
      } catch {
        /* no-op */
      }
    });
  }, [uid]);

  // Se a permissão/inscrição mudar, volta a garantir o link ao utilizador
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    w.OneSignal = w.OneSignal || [];
    w.OneSignal.push(() => {
      const OS = w.OneSignal;
      const relink = async () => {
        try {
          if (!uid) return;
          if (typeof OS?.login === "function") await OS.login(uid);
          else if (typeof OS?.setExternalUserId === "function") await OS.setExternalUserId(uid);

          if (OS?.User?.addTag) await OS.User.addTag("uid", uid);
          else if (typeof OS?.sendTag === "function") await OS.sendTag("uid", uid);
        } catch {
          /* no-op */
        }
      };

      OS?.Notifications?.addEventListener?.("permissionChange", relink);
      OS?.Notifications?.addEventListener?.("subscribe", relink);
    });
  }, [uid]);

  return null;
}
