// lib/serverNotify.ts
export const runtime = "nodejs";

/**
 * Envia push via /api/notify no MESMO deployment.
 * Usa VERCEL_URL quando disponível; suporta bypass token para Deployment Protection.
 */
export async function serverNotify(
  uid: string,
  title: string,
  message: string,
  url?: string
) {
  if (!title || !message) throw new Error("title and message are required");

  const bearer = (process.env.NOTIFY_BEARER || "").trim();
  if (!bearer) throw new Error("NOTIFY_BEARER is not configured");

  // 1) prefer VERCEL_URL (o host do deployment atual)
  const vercelHost = (process.env.VERCEL_URL || "").trim();
  let origin = vercelHost ? `https://${vercelHost}` : "";

  // 2) fallback para NEXT_PUBLIC_BASE_URL
  if (!origin) {
    const baseEnv = (process.env.NEXT_PUBLIC_BASE_URL || "").trim();
    if (baseEnv) origin = baseEnv.startsWith("http") ? baseEnv : `https://${baseEnv}`;
  }

  // 3) fallback final: domínio de produção
  if (!origin) origin = "https://mais-attivo-app.vercel.app";
  origin = origin.replace(/\/+$/, "");

  const endpoint = `${origin}/api/notify`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${bearer}`,
  };

  // Se existir bypass token do Vercel, inclui-o no header
  const bypass = (process.env.VERCEL_PROTECTION_BYPASS || "").trim();
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({ uid, title, message, url }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `notify failed: ${res.status} ${res.statusText} (origin: ${origin})`);
  }

  try {
    return await res.json();
  } catch {
    return { ok: true };
  }
}
