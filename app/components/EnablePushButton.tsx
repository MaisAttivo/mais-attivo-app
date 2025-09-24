"use client";
import { useEffect, useState } from "react";

export default function EnablePushButton() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"default"|"enabled"|"blocked">("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const OneSignal = (window as any).OneSignal || [];
    OneSignal.push(async () => {
      setReady(true);
      const perm = await OneSignal.Notifications.getPermissionStatus();
      if (perm === "granted") setStatus("enabled");
      if (perm === "denied") setStatus("blocked");
    });
  }, []);

  const handleEnable = async () => {
    const OneSignal = (window as any).OneSignal || [];
    OneSignal.push(async () => {
      await OneSignal.Slidedown.promptPush(); // abre o pedido oficial do browser
      const perm = await OneSignal.Notifications.getPermissionStatus();
      if (perm === "granted") setStatus("enabled");
      if (perm === "denied") setStatus("blocked");
    });
  };

  if (!ready) return null;

  if (status === "enabled") return <p>🔔 Notificações ativas!</p>;
  if (status === "blocked") return <p>🚫 Notificações bloqueadas. Ativa nas definições do site.</p>;

  return (
    <button
      onClick={handleEnable}
      style={{ padding: "10px 16px", borderRadius: 12, border: "1px solid #ccc", cursor: "pointer" }}
    >
      Ativar notificações 🔔
    </button>
  );
}
