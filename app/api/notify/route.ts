import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { title, message, uid, url } = await req.json();

    const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    const REST = process.env.ONESIGNAL_REST_API_KEY;

    if (!APP_ID || !REST) {
      return NextResponse.json({ error: "Missing OneSignal keys" }, { status: 500 });
    }

    // Base comum
    const base: any = {
      app_id: APP_ID,
      target_channel: "push",                 // ajuda a API a inferir o canal
      headings: { en: title ?? "Mais+Ativo", pt: title ?? "Mais+Ativo" },
      contents: { en: message ?? "", pt: message ?? "" },
    };

    // Link ao clicar
    if (url) {
      // tanto "url" (legacy) como web_push.fallback despoletam navegação
      base.url = url;
      base.web_push = { url };
    }

    // ===== Escolher o alvo =====
    if (uid) {
      // 1) Modo moderno: external_id (funciona se usares OS.login(uid))
      const modern = {
        ...base,
        include_aliases: { external_id: [uid] }
      };

      let res = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Basic ${REST}`,
        },
        body: JSON.stringify(modern),
      });

      if (!res.ok) {
        // 2) Fallback legacy: por tag (funciona se o device tiver tag uid=...)
        const legacy = {
          ...base,
          filters: [{ field: "tag", key: "uid", relation: "=", value: uid }],
        };
        const res2 = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": `Basic ${REST}`,
          },
          body: JSON.stringify(legacy),
        });

        // devolver erro detalhado se ainda falhar
        if (!res2.ok) {
          const t1 = await res.text().catch(() => "");
          const t2 = await res2.text().catch(() => "");
          return NextResponse.json(
            { error: "OneSignal rejected request", primary: t1, fallback: t2 },
            { status: 400 }
          );
        }
        const data2 = await res2.json().catch(() => ({}));
        return NextResponse.json(data2, { status: 200 });
      }

      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: 200 });
    } else {
      // Enviar para todos os subscritos
      const payload = { ...base, included_segments: ["Subscribed Users"] };

      const res = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Basic ${REST}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!res.ok) {
        return NextResponse.json({ error: "OneSignal rejected request", details: text }, { status: 400 });
      }
      try { return NextResponse.json(JSON.parse(text), { status: 200 }); }
      catch { return NextResponse.json({ ok: true, raw: text }, { status: 200 }); }
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
