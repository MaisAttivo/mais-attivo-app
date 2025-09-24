"use client";
import { useEffect, useState } from "react";

type Perm = "default" | "granted" | "denied";

export default function EnablePushButton() {
  const [ready, setReady] = useState(false);
  const [perm, setPerm] = useState<Perm>("default");
  const [optedIn, setOptedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBlockedHelp, setShowBlockedHelp] = useState(false);

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

      try {
        const dismissed = typeof sessionStorage !== "undefined" && sessionStorage.getItem("attivo_push_blocked_dismissed") === "1";
        if (!dismissed) {
          const currentPerm: Perm = typeof OneSignal.Notifications?.getPermissionStatus === "function"
            ? await OneSignal.Notifications.getPermissionStatus()
            : (typeof Notification !== "undefined" ? (Notification.permission as Perm) : "default");
          if (currentPerm === "denied") setShowBlockedHelp(true);
        }
      } catch {}
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
    try { if (typeof window !== "undefined" && "vibrate" in navigator) { (navigator as any).vibrate?.(10); } } catch {}
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
      <>
        <button
          type="button"
          onClick={() => setShowBlockedHelp(true)}
          className="inline-flex items-center rounded-[20px] border-[3px] border-slate-400 bg-white px-3 py-1.5 text-xs text-slate-600 shadow hover:bg-slate-50"
          title="Notificações bloqueadas no navegador"
          aria-label="Notificações bloqueadas"
        >
          🚫
        </button>

        {showBlockedHelp && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => {
                try { sessionStorage.setItem("attivo_push_blocked_dismissed", "1"); } catch {}
                setShowBlockedHelp(false);
              }}
            />
            <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-lg ring-2 ring-rose-400 p-5">
              <h2 className="text-lg font-semibold text-rose-700">Notificações bloqueadas</h2>
              <p className="mt-2 text-sm text-slate-700">
                Para ativar, abre as definições do site no teu navegador e permite as notificações.
              </p>
              <ul className="mt-2 text-xs text-slate-600 list-disc pl-5 space-y-1">
                <li>Clica no cadeado ao lado do endereço.</li>
                <li>Vai a Permissões &gt; Notificações &gt; Permitir.</li>
                <li>Recarrega a página e toca no sino para ativar.</li>
              </ul>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    try { sessionStorage.setItem("attivo_push_blocked_dismissed", "1"); } catch {}
                    setShowBlockedHelp(false);
                  }}
                  className="rounded-[20px] overflow-hidden border-[3px] border-[#706800] text-[#706800] bg-white px-4 py-2 shadow hover:bg-[#FFF4D1]"
                >
                  Ok, percebi
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const isOn = perm === "granted" && optedIn !== false;
  const label = isOn ? "Desativar notificações" : "Ativar notificações";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-busy={busy}
      className={`inline-flex items-center gap-1 rounded-[20px] border-[3px] px-3 py-1.5 text-sm shadow transition-colors active:scale-95 ${
        isOn
          ? "border-[#706800] text-[#706800] bg-white hover:bg-[#FFF4D1]"
          : "border-slate-400 text-slate-700 bg-white hover:bg-slate-50"
      } ${busy ? "opacity-70 cursor-not-allowed" : ""}`}
      aria-pressed={isOn}
      aria-label={label}
      title={label}
    >
      {busy ? (
        <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" aria-hidden />
      ) : (
        <span aria-hidden>{isOn ? "🔔" : "🔕"}</span>
      )}
    </button>
  );
}
