"use client";
import { useEffect, useState } from "react";

export default function EnablePushButton() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"default" | "enabled" | "blocked">(
    "default"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const OneSignal = (window as any).OneSignal || [];
    OneSignal.push(async () => {
      setReady(true);
      try {
        const perm = await OneSignal.Notifications.getPermissionStatus();
        if (perm === "granted") setStatus("enabled");
        if (perm === "denied") setStatus("blocked");
      } catch {}
    });
  }, []);

  const handleEnable = async () => {
    const OneSignal = (window as any).OneSignal || [];
    OneSignal.push(async () => {
      try {
        if (OneSignal.Slidedown?.promptPush) {
          await OneSignal.Slidedown.promptPush();
        } else if (OneSignal.Notifications?.requestPermission) {
          await OneSignal.Notifications.requestPermission();
        }
      } catch {}
      try {
        const perm = await OneSignal.Notifications.getPermissionStatus();
        if (perm === "granted") setStatus("enabled");
        if (perm === "denied") setStatus("blocked");
      } catch {}
    });
  };

  if (!ready) return null;
  if (status === "enabled") return <p>🔔 Notificações ativas!</p>;
  if (status === "blocked")
    return <p>🚫 Notificações bloqueadas. Ativa nas definições do site.</p>;

  return (
    <button
      type="button"
      onClick={handleEnable}
      className="enable-push-button px-4 py-2.5 rounded-[12px] border border-[#ccc] cursor-pointer bg-white shadow-sm hover:bg-slate-50 text-slate-800"
    >
      Ativar notificações 🔔
    </button>
  );
}
