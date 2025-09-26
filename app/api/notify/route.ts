export const runtime = "nodejs"; // força Node e evita surpresas no Edge

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { title, message, uid, url } = await req.json();

    const APP_ID = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
    const REST   = (process.env.ONESIGNAL_REST_API_KEY || "").trim();
    // define a origem via env; se faltar, força EU por defeito
    const ORIGIN = (process.env.ONESIGNAL_API_ORIGIN || "https://api.eu.onesignal.com").trim();
    const ENDPOINT = `${ORIGIN.replace(/\/+$/, "")}/notifications`;

    if (!APP_ID || !REST) {
      return NextResponse.json(
        { error: "Missing OneSignal keys", hasAppId: !!APP_ID, hasRest: !!REST },
        { status: 500 }
      );
    }

    const base: any = {
      app_id: APP_ID,
      target_channel: "push",
      headings: { pt: title ?? "Mais+Ativo", en: title ?? "Mais+Ativo" },
      contents: { pt: message ?? "", en: message ?? "" },
    };
    if (url) {
      base.url = url;
      base.web_push = { url };
    }

    async function post(body: any) {
      let res: Response;
      try {
        res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": `Basic ${REST}`,
          },
          body: JSON.stringify(body),
        });
      } catch (e: any) {
        // quando a fetch falha antes de resposta
        return NextResponse.json(
          {
            error: "fetch failed",
            origin: ORIGIN,
            endpoint: ENDPOINT,
            appIdLen: APP_ID.length,
            restLen: REST.length,
            reason: String(e?.message || e),
          },
          { status: 500 }
        );
      }

      const text = await res.text();
      if (!res.ok) {
        return NextResponse.json(
          { error: "OneSignal rejected request", status: res.status, details: text, origin: ORIGIN },
          { status: 400 }
        );
      }
      try { return NextResponse.json(JSON.parse(text), { status: 200 }); }
      catch { return NextResponse.json({ ok: true, raw: text }, { status: 200 }); }
    }

    if (uid) {
      // 1) alvo por external_id (requer OS.login(uid) no cliente)
      const modern = { ...base, include_aliases: { external_id: [uid] } };
      const r1 = await post(modern);
      if (r1.status === 200) return r1;

      // 2) fallback por tag uid
      const legacy = { ...base, filters: [{ field: "tag", key: "uid", relation: "=", value: uid }] };
      return post(legacy);
    } else {
      // broadcast
      const payload = { ...base, included_segments: ["Subscribed Users"] };
      return post(payload);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
