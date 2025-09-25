"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

export default function EnablePushButton() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"default" | "enabled" | "blocked">("default");
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const queue = ((window as any).OneSignal = (window as any).OneSignal || []);
    queue.push(async () => {
      setReady(true);
      try {
        const OS = (window as any).OneSignal;
        const perm = await OS?.Notifications?.getPermissionStatus?.();
        if (perm === "granted") setStatus("enabled");
        if (perm === "denied") setStatus("blocked");
      } catch {}
    });
  }, []);

  const showToast = (type: "success" | "error" | "info", msg: string) => {
    setToast({ type, msg });
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 2500);
  };

  const handleBellClick = async () => {
    try {
      const OS = (window as any).OneSignal;
      const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
      if (!supported) {
        showToast("error", "O teu navegador não suporta notificações push");
        return;
      }

      if (status === "default") {
        // Tenta pedir permissão imediatamente dentro do gesto do utilizador
        if (OS?.Notifications?.requestPermission) {
          await OS.Notifications.requestPermission();
        } else if (OS?.Slidedown?.promptPush) {
          await OS.Slidedown.promptPush();
        } else if ((window as any).Notification?.requestPermission) {
          await (window as any).Notification.requestPermission();
        }
      }
    } catch {}

    try {
      const OS = (window as any).OneSignal;
      const perm = (await OS?.Notifications?.getPermissionStatus?.()) ?? (window as any).Notification?.permission;
      const next = perm === "granted" ? "enabled" : perm === "denied" ? "blocked" : "default";
      if (next !== status) {
        setStatus(next);
        if (next === "enabled") showToast("success", "Notificações ativadas");
        else if (next === "blocked") showToast("error", "Notificações bloqueadas nas definições do navegador");
        else showToast("info", "Pedido de notificações enviado");
      } else {
        if (next === "enabled") showToast("info", "Notificações já ativas");
        else if (next === "blocked") showToast("error", "Notificações bloqueadas (altera nas definições do site)");
        else showToast("info", "Se não aparecer o pedido, verifica as permissões do site");
      }
    } catch {
      showToast("error", "Não foi possível verificar o estado das notificações");
    }
  };

  if (!ready) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleBellClick}
        aria-label={status === "enabled" ? "Notificações ativas" : status === "blocked" ? "Notificações bloqueadas" : "Ativar notificações"}
        title={status === "enabled" ? "Notificações ativas" : status === "blocked" ? "Notificações bloqueadas" : "Ativar notificações"}
        className="enable-push-button relative h-10 w-10 rounded-full border border-[#ccc] cursor-pointer bg-white shadow-sm hover:bg-slate-50 flex items-center justify-center"
      >
        <Bell className="h-5 w-5 text-slate-700" />
        {status === "blocked" && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1 right-1 top-1/2 -translate-y-1/2 block h-[2px] bg-rose-600 rotate-45 rounded"
          />
        )}
      </button>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-4 top-16 z-50 px-4 py-2 rounded-xl text-white shadow ${
            toast.type === "success" ? "bg-emerald-600" : toast.type === "error" ? "bg-rose-600" : "bg-slate-700"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
