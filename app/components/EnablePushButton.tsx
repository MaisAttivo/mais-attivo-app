"use client";
import { useEffect, useState } from "react";

type Perm = "default" | "granted" | "denied";

export default function EnablePushButton() {
  const [ready, setReady] = useState(false);
  const [perm, setPerm] = useState<Perm>("default");
  const [optedIn, setOptedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBlockedHelp, setShowBlockedHelp] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const OneSignal = (window as any).OneSignal || [];
    OneSignal.push(async () => {
      setReady(true);
      try {
        const sup = typeof OneSignal.Notifications?.isPushSupported === "function"
          ? await OneSignal.Notifications.isPushSupported()
          : (typeof window !== "undefined" && "Notification" in window && !!navigator?.serviceWorker);
        setSupported(!!sup);
      } catch {
        setSupported(null);
      }

      try {
        let p: Perm = "default";
        if (typeof OneSignal.Notifications?.getPermissionStatus === "function") {
          p = await OneSignal.Notifications.getPermissionStatus();
        } else if (typeof Notification !== "undefined") {
          p = Notification.permission as Perm;
        }
        setPerm(p);
      } catch {}

      await refreshState();

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

      // Determine subscription/opt-in robustly
      let sub: boolean | null = null;
      try {
        if (typeof OneSignal.Notifications?.isSubscribed === "function") {
          sub = await OneSignal.Notifications.isSubscribed();
        }
      } catch {}
      if (sub === null) {
        try {
          const maybe = OneSignal.User?.PushSubscription;
          if (typeof maybe?.optedIn === "boolean") sub = maybe.optedIn as boolean;
          else if (typeof maybe?.optedIn === "function") sub = await maybe.optedIn();
          else if (typeof maybe?.getOptedIn === "function") sub = await maybe.getOptedIn();
          else if (typeof maybe?.id === "string" && !!maybe.id) sub = true;
        } catch {}
      }
      if (typeof sub === "boolean") setOptedIn(sub);
    } catch {}
  };

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const OneSignal = (window as any).OneSignal || [];
    OneSignal.push(async () => {
      try {
        const currentPerm: Perm = typeof OneSignal.Notifications?.getPermissionStatus === "function"
          ? await OneSignal.Notifications.getPermissionStatus()
          : (typeof Notification !== "undefined" ? (Notification.permission as Perm) : "default");

        if (currentPerm === "denied") {
          setShowBlockedHelp(true);
          return;
        }

        // Recompute current subscribed state
        await refreshState();
        const currentlyIn = optedIn === true;

        // When permission not yet decided → request, then subscribe
        if (currentPerm === "default") {
          try {
            if (typeof OneSignal.Notifications?.requestPermission === "function") {
              const res = await OneSignal.Notifications.requestPermission();
              if (res !== "granted") return;
            }
          } catch {}
        }

        if (!currentlyIn) {
          // Subscribe
          let done = false;
          try {
            if (typeof OneSignal.Notifications?.subscribe === "function") {
              await OneSignal.Notifications.subscribe();
              done = true;
            }
          } catch {}
          if (!done) {
            try { if (OneSignal.User?.PushSubscription?.optIn) await OneSignal.User.PushSubscription.optIn(); } catch {}
          }
        } else {
          // Unsubscribe
          let done = false;
          try {
            if (typeof OneSignal.Notifications?.unsubscribe === "function") {
              await OneSignal.Notifications.unsubscribe();
              done = true;
            }
          } catch {}
          if (!done) {
            try { if (OneSignal.User?.PushSubscription?.optOut) await OneSignal.User.PushSubscription.optOut(); } catch {}
          }
        }
      } finally {
        await refreshState();
        setBusy(false);
      }
    });
  };

  if (!ready) return null;

  if (supported === false) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center rounded-[20px] border-[3px] border-slate-400 bg-white px-3 py-1.5 text-xs text-slate-600 opacity-70 cursor-not-allowed shadow"
        title="Notificações não suportadas neste dispositivo/navegador"
        aria-label="Notificações não suportadas"
      >
        🚫
      </button>
    );
  }

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

  const isOn = perm === "granted" && optedIn === true;
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
