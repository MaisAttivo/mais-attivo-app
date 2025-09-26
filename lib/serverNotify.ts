export const runtime = "nodejs";

/**
 * Server-side utility to send OneSignal push via our protected /api/notify route.
 * Requires process.env.NOTIFY_BEARER to be set in the server environment.
 */
export async function serverNotify(uid: string, title: string, message: string, url?: string) {
  if (!title || !message) throw new Error("title and message are required");

  const bearer = (process.env.NOTIFY_BEARER || "").trim();
  if (!bearer) throw new Error("NOTIFY_BEARER is not configured");

  // Prefer configured base URL; otherwise reconstruct from common headers when available
  const origin = (process.env.NEXT_PUBLIC_BASE_URL || "").trim() ||
    "https://mais-ativo-app.vercel.app"; // fallback to production host if env not provided

  const res = await fetch(`${origin.replace(/\/$/, "")}/api/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${bearer}`,
    },
    body: JSON.stringify({ uid, title, message, url }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `notify failed with ${res.status}`);
  }

  try { return await res.json(); } catch { return { ok: true }; }
}
