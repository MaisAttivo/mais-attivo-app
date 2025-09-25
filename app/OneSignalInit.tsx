"use client";
import { useEffect } from "react";
import { useSession } from "@/lib/auth";

export default function OneSignalInit() {
  const { uid } = useSession();

  // Load SDK and init once
  useEffect(() => {
    if (typeof window === "undefined") return;

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
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false },
        serviceWorkerPath: "/OneSignalSDKWorker.js",
        serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
        serviceWorkerParam: { scope: "/" },
      });
    });
  }, []);

  // Link/unlink the current Firebase user to OneSignal device
  useEffect(() => {
    if (typeof window === "undefined") return;
    const queue = ((window as any).OneSignal = (window as any).OneSignal || []);
    queue.push(async () => {
      try {
        const OS = (window as any).OneSignal;
        if (uid) {
          if (typeof OS?.login === "function") {
            await OS.login(uid);
          } else if (typeof OS?.setExternalUserId === "function") {
            await OS.setExternalUserId(uid);
          }
          if (OS?.User?.addTag) {
            await OS.User.addTag("uid", uid);
          } else if (typeof OS?.sendTag === "function") {
            await OS.sendTag("uid", uid);
          }
        } else {
          if (typeof OS?.logout === "function") {
            await OS.logout();
          } else if (typeof OS?.removeExternalUserId === "function") {
            await OS.removeExternalUserId();
          }
          if (OS?.User?.removeTag) {
            await OS.User.removeTag("uid");
          }
        }
      } catch {}
    });
  }, [uid]);

  // On permission/subscription changes, ensure the user is linked
  useEffect(() => {
    if (typeof window === "undefined") return;
    const queue = ((window as any).OneSignal = (window as any).OneSignal || []);
    queue.push(() => {
      const OS = (window as any).OneSignal;
      try {
        const relink = async () => {
          try {
            if (!uid) return;
            if (typeof OS?.login === "function") await OS.login(uid);
            else if (typeof OS?.setExternalUserId === "function") await OS.setExternalUserId(uid);
            if (OS?.User?.addTag) await OS.User.addTag("uid", uid);
            else if (typeof OS?.sendTag === "function") await OS.sendTag("uid", uid);
          } catch {}
        };
        OS?.Notifications?.addEventListener?.("permissionChange", relink);
        OS?.Notifications?.addEventListener?.("subscribe", relink);
      } catch {}
    });
  }, [uid]);

  return null;
}
