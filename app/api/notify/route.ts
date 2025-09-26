import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { title, message, uid, url } = await req.json();

    const APP_ID = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
    const REST_RAW = process.env.ONESIGNAL_REST_API_KEY || "";
    const REST = REST_RAW.trim();
    // mude aqui para EU se precisares, ou define a env NEXT_PUBLIC_ONESIGNAL_ORIGIN
    const ORIGIN = (process.env.NEXT_PUBLIC_ONESIGNAL_ORIGIN || "https://api.onesignal.com").trim();

    if (!APP_ID || !REST) {
      return NextResponse.json({ error: "Missing OneSignal keys" }, { status: 500 });
    }

    const base: any = {
      app_id: APP_ID,
      target_channel: "push",
      headings: { en: title ?? "Mais+Ativo", pt: title ?? "Mais+Ativo" },
      contents: { en: message ?? "", pt: message ?? "" },
    };
    if (url) {
      base.url = url;
      base.web_push = { url };
    }

    const endpoint = `${ORIGIN}/notifications`;

    async function post(body: any) {
      const res = await fetch(endpoint, {
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
          { error: "OneSignal rejected request", status: res.status, details: text, origin: ORIGIN, hasRest: !!REST, restLen: REST.length },
          { status: 400 }
        );
      }
      try { return NextResponse.json(JSON.parse(text), { status: 200 }); }
      catch { return NextResponse.json({ ok: true, raw: text }, { status: 200 }); }
    }

    if (uid) {
      // modo moderno (external_id)
      const modern = { ...base, include_aliases: { external_id: [uid] } };
      const resp = await post(modern);
      if (resp.status !== 400) return resp;

      // fallback legacy (tag uid)
      const legacy = { ...base, filters: [{ field: "tag", key: "uid", relation: "=", value: uid }] };
      return post(legacy);
    } else {
      const broadcast = { ...base, included_segments: ["Subscribed Users"] };
      return post(broadcast);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
