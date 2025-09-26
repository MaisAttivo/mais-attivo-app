export const runtime = "nodejs";

/**
 * Envia push via a tua rota protegida /api/notify (no MESMO deployment).
 * Requer NOTIFY_BEARER definido nas envs do servidor (Vercel).
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

  // 1) Usa SEMPRE o host do deployment atual quando existir (evita DEPLOYMENT_NOT_FOUND)
  const vercelHost = (process.env.VERCEL_URL || "").trim(); // ex: my-app-abc123.vercel.app
  let origin = vercelHost ? `https://${vercelHost}` : "";

  // 2) Se não houver VERCEL_URL (ex.: local dev), tenta NEXT_PUBLIC_BASE_URL
  if (!origin) {
    const baseEnv = (process.env.NEXT_PUBLIC_BASE_URL || "").trim();
    if (baseEnv) {
      origin = baseEnv.startsWith("http") ? baseEnv : `https://${baseEnv}`;
    }
  }

  // 3) Fallback final: domínio de produção
  if (!origin) origin = "https://mais-ativo-app.vercel.app";

  // remove barra final para evitar //api/notify
  origin = origin.replace(/\/+$/, "");

  const endpoint = `${origin}/api/notify`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${bearer}`,
    },
    // cache no-store para não haver surprises em edge caches
    cache: "no-store",
    body: JSON.stringify({ uid, title, message, url }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Erro informativo com origem e status para debug rápido
    throw new Error(
      text ||
        `notify failed: ${res.status} ${res.statusText} (origin: ${origin})`
    );
  }

  try {
    return await res.json();
  } catch {
    return { ok: true };
  }
}
