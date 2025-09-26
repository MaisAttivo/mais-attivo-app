export const runtime = "nodejs";

import { NextResponse } from "next/server";

const V1 = (process.env.ONESIGNAL_API_V1_ORIGIN || "https://onesignal.com/api/v1").replace(/\/+$/,"");

export async function POST(req: Request) {
  try {
    const { title, message, uid, url } = await req.json();

    const APP_ID = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
    const REST   = (process.env.ONESIGNAL_REST_API_KEY || "").trim();

    if (!APP_ID || !REST) {
      return NextResponse.json({ error: "Missing OneSignal keys" }, { status: 500 });
    }

    const base: any = {
      app_id: APP_ID,
      headings: { pt: title ?? "Mais+Ativo", en: title ?? "Mais+Ativo" },
      contents: { pt: message ?? "",        en: message ?? ""        },
      url, // abre a tua app ao clicar (opcional)
    };

    async function post(body: any) {
      try {
        const res = await fetch(`${V1}/notifications`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": `Basic ${REST}`,
          },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        if (!res.ok) {
          return NextResponse.json(
            { error: "OneSignal rejected request", status: res.status, details: text, origin: V1 },
            { status: 400 }
          );
        }
        try { return NextResponse.json(JSON.parse(text), { status: 200 }); }
        catch { return NextResponse.json({ ok: true, raw: text }, { status: 200 }); }
      } catch (e: any) {
        return NextResponse.json(
          { error: "fetch failed", origin: V1, reason: String(e?.message || e) },
          { status: 500 }
        );
      }
    }

    if (uid) {
      // alvo moderno na API v1
      const modern = { ...base, include_external_user_ids: [uid] };
      const r1 = await post(modern);
      if (r1.status === 200) return r1;

      // fallback por tag
      const legacy = { ...base, filters: [{ field: "tag", key: "uid", relation: "=", value: uid }] };
      return p
