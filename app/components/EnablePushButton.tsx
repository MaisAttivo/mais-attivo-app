"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useSession } from "@/lib/auth";

export default function EnablePushButton() {
  const { uid } = useSession();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"default" | "enabled" | "blocked">("default");
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  // Resolve estado real: permissões + subscrição (compatível com várias versões do SDK)
  async function resolveStatus(): Promise<"default" | "enabled" | "blocked"> {
    try {
      const OS = (window as any).OneSignal;
      const perm = (await OS?.Notifications?.getPermissionStatus?.()) ?? (window as any).Notification?.permission;
      if (perm === "denied") return "blocked";
      if (perm !== "granted") return "default";

      // Com permissão concedida, verificar se está subscrito
      try {
        if (OS?.User?.Push?.getSubscription) {
          const sub = await OS.User.Push.getSubscription();
          const enabled = typeof sub === "boolean" ? sub : !!(sub?.optedIn ?? sub?.enabled ?? sub?.isOptedIn);
          return enabled ? "enabled" : "default";
        }
        if (OS?.Notifications?.isPushEnabled) {
          const en = await OS.Notifications.isPushEnabled();
          return en ? "enabled" : "default";
        }
        if (typeof OS?.isPushNotificationsEnabled === "function") {
          const en: boolean = await new Promise((res) => OS.isPushNotificationsEnabled(res));
          return en ? "enabled" : "default";
        }
      } catch {}

      // Sem forma de saber subscrição → assumir enabled quando há permissão
      return "enabled";
    } catch {
      return "default";
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const queue = ((window as any).OneSignal = (window as any).OneSignal || []);
    queue.push(async () => {
      setReady(true);
      setStatus(await resolveStatus());
    });
  }, []);

  const showToast = (type: "success" | "error" | "info", msg: string) => {
    setToast({ type, msg });
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 2500);
  };

  async function requestPermissionCompat(OS: any): Promise<NotificationPermission | undefined> {
    try {
      if (OS?.Notifications?.requestPermission) {
        const rp = OS.Notifications.requestPermission as any;
        return await new Promise<NotificationPermission | undefined>((resolve) => {
          try {
            const maybe = rp((p: NotificationPermission) => resolve(p));
            if (maybe && typeof maybe.then === "function") {
              (maybe as Promise<NotificationPermission>).then(resolve).catch(() => resolve(undefined));
            }
          } catch {
            resolve(undefined);
          }
        });
      }
    } catch {}

    if ((window as any).Notification?.requestPermission) {
      try {
        const rp = (window as any).Notification.requestPermission as any;
        return await new Promise<NotificationPermission | undefined>((resolve) => {
          try {
            const maybe = rp((p: NotificationPermission) => resolve(p));
            if (maybe && typeof maybe.then === "function") {
              (maybe as Promise<NotificationPermission>).then(resolve).catch(() => resolve(undefined));
            }
          } catch {
            resolve(undefined);
          }
        });
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  const handleBellClick = async () => {
    const OS = (window as any).OneSignal;
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    if (!supported) {
      showToast("error", "O teu navegador não suporta notificações push");
      return;
    }

    try {
      if (status === "blocked") {
        showToast("error", "Notificações bloqueadas nas definições do navegador");
        return;
      }

      if (status === "enabled") {
        // Desativar (opt‑out) mantendo a permissão do navegador
        if (OS?.User?.Push?.setSubscription) {
          await OS.User.Push.setSubscription(false);
        } else if (typeof OS?.setSubscription === "function") {
          await OS.setSubscription(false);
        } else if (OS?.Notifications?.optOut) {
          await OS.Notifications.optOut();
        } else {
          showToast("info", "Para desativar completamente, usa as definições do site no navegador");
        }
        setStatus(await resolveStatus());
        if (status === "enabled") showToast("success", "Notificações desativadas");
        return;
      }

      // status === "default": ativar
      if (OS?.User?.Push?.setSubscription) {
        // Se já houver permissão concedida, basta subscrever
        const perm = (await OS?.Notifications?.getPermissionStatus?.()) ?? (window as any).Notification?.permission;
        if (perm === "granted") {
          await OS.User.Push.setSubscription(true);
        } else {
          showToast("info", "A pedir permissão para notificações…");
          await requestPermissionCompat(OS);
        }
      } else {
        // SDK antigo
        showToast("info", "A pedir permissão para notificações…");
        await requestPermissionCompat(OS);
      }

      const next = await resolveStatus();
      setStatus(next);
      if (next === "enabled") showToast("success", "Notificações ativadas");
      else if (next === "blocked") showToast("error", "Notificações bloqueadas nas definições do navegador");
      else showToast("info", "Pedido de notificações enviado");
    } catch {
      showToast("error", "Não foi possível alterar o estado das notificações");
      setStatus(await resolveStatus());
    }
  };

  useEffect(() => {
    const onFocus = () => { resolveStatus().then(setStatus).catch(() => {}); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

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
