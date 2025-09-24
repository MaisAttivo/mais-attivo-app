"use client";
import { useEffect, useState } from "react";

type Perm = "default" | "granted" | "denied";

export default function EnablePushButton() {
  const [ready, setReady] = useState(false);
  const [perm, setPerm] = useState<Perm>("default");
  const [optedIn, setOptedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const OneSignal = (window as any).OneSignal || [];
    OneSignal.push(async () => {
      setReady(true);
      try {
        let p: Perm = "default";
        if (typeof OneSignal.Notifications?.getPermissionStatus === "function") {
          p = await OneSignal.Notifications.getPermissionStatus();
        } else if (typeof Notification !== "undefined") {
          p = Notification.permission as Perm;
        }
        setPerm(p);
      } catch {}
      try {
        const inVal =
          (OneSignal.User?.PushSubscription?.optedIn as boolean | undefined) ??
          (typeof OneSignal.User?.PushSubscription?.optedIn === "function"
            ? await OneSignal.User.PushSubscription.optedIn()
            : undefined);
        if (typeof inVal === "boolean") setOptedIn(inVal);
      } catch {
        setOptedIn(null);
      }
    });
  }, []);

  const refreshState = async () => {
    try {
      const OneSignal = (window as any).OneSignal || [];
      const p: Perm = typeof OneSignal.Notifications?.getPermissionStatus === "function"
        ? await OneSignal.Notifications.getPermissionStatus()
        : (typeof Notification !== "undefined" ? (Notification.permission as Perm) : "default");
      setPerm(p);
      try {
        const inVal =
          (OneSignal.User?.PushSubscription?.optedIn as boolean | undefined) ??
          (typeof OneSignal.User?.PushSubscription?.optedIn === "function"
            ? await OneSignal.User.PushSubscription.optedIn()
            : undefined);
        if (typeof inVal === "boolean") setOptedIn(inVal);
      } catch {}
    } catch {}
  };

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const OneSignal = (window as any).OneSignal || [];
    OneSignal.push(async () => {
      try {
        if (perm === "denied") {
          setBusy(false);
          return;
        }
        if (perm === "default" || optedIn === false) {
          try {
            if (OneSignal.Slidedown?.promptPush) {
              await OneSignal.Slidedown.promptPush();
            } else if (OneSignal.Notifications?.requestPermission) {
              await OneSignal.Notifications.requestPermission();
            }
          } catch {}
          try {
            if (OneSignal.User?.PushSubscription?.optIn) {
              await OneSignal.User.PushSubscription.optIn();
            }
          } catch {}
        } else {
          try {
            if (OneSignal.User?.PushSubscription?.optOut) {
              await OneSignal.User.PushSubscription.optOut();
            }
          } catch {}
        }
      } finally {
        await refreshState();
        setBusy(false);
      }
    });
  };

  if (!ready) return null;

  if (perm === "denied") {
    return (
      <span
        className="inline-flex items-center rounded-[20px] border-[3px] border-slate-400 bg-white px-3 py-1.5 text-xs text-slate-600 shadow"
        title="Notificações bloqueadas no navegador"
        aria-label="Notificações bloqueadas"
      >
        🚫
      </span>
    );
  }

  const isOn = perm === "granted" && optedIn !== false;
  const label = isOn ? "Desativar notificações" : "Ativar notificações";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center gap-1 rounded-[20px] border-[3px] px-3 py-1.5 text-sm shadow transition-colors ${
        isOn
          ? "border-[#706800] text-[#706800] bg-white hover:bg-[#FFF4D1]"
          : "border-slate-400 text-slate-700 bg-white hover:bg-slate-50"
      } ${busy ? "opacity-70 cursor-not-allowed" : ""}`}
      aria-pressed={isOn}
      aria-label={label}
      title={label}
    >
      <span aria-hidden>{isOn ? "🔔" : "🔕"}</span>
    </button>
  );
}
