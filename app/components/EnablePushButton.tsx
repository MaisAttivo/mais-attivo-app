"use client";
import { useEffect, useState } from "react";

type Status = "default" | "enabled" | "blocked";

declare global {
  interface Window { OneSignal: any }
}

export default function EnablePushButton() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const OneSignal = (window as any).OneSignal || [];
    OneSignal.push(async () => {
      setReady(true);
      try {
        const perm: string = await OneSignal?.Notifications?.getPermissionStatus?.();
        if (perm === "granted") setStatus("enabled");
        else if (perm === "denied") setStatus("blocked");
        else setStatus("default");
      } catch {
        try {
          const nativePerm = typeof Notification !== "undefined" ? Notification.permission : "default";
          if (nativePerm === "granted") setStatus("enabled");
          else if (nativePerm === "denied") setStatus("blocked");
        } catch {}
      }
    });
  }, []);

  const handleEnable = async () => {
    const OneSignal = (window as any).OneSignal || [];
    OneSignal.push(async () => {
      try {
        if (OneSignal?.Slidedown?.promptPush) {
          await OneSignal.Slidedown.promptPush();
        } else if (OneSignal?.Notifications?.requestPermission) {
          await OneSignal.Notifications.requestPermission();
        } else if (typeof Notification !== "undefined" && Notification.requestPermission) {
          await Notification.requestPermission();
        }
      } catch {}

      try { if (OneSignal?.User?.PushSubscription?.optIn) await OneSignal.User.PushSubscription.optIn(); } catch {}

      try {
        const perm: string = await (OneSignal?.Notifications?.getPermissionStatus?.() ?? "default");
        if (perm === "granted") setStatus("enabled");
        else if (perm === "denied") setStatus("blocked");
        else setStatus("default");
      } catch {
        try {
          const nativePerm = typeof Notification !== "undefined" ? Notification.permission : "default";
          if (nativePerm === "granted") setStatus("enabled");
          else if (nativePerm === "denied") setStatus("blocked");
          else setStatus("default");
        } catch {}
      }
    });
  };

  if (!ready) return null;
  if (status === "enabled") return <p className="text-sm text-[#706800]">🔔 Notificações ativas!</p>;
  if (status === "blocked") return <p className="text-sm text-rose-700">🚫 Notificações bloqueadas. Ativa nas definições do site.</p>;

  return (
    <button
      type="button"
      onClick={handleEnable}
      className="inline-flex items-center rounded-[20px] border-[3px] border-slate-400 bg-white px-3 py-1.5 text-sm text-slate-700 shadow hover:bg-slate-50"
      aria-label="Ativar notificações"
      title="Ativar notificações"
    >
      Ativar notificações 🔔
    </button>
  );
}
