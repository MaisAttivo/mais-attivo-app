import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { title, message, uid, url } = await req.json();

    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || !process.env.ONESIGNAL_REST_API_KEY) {
      return NextResponse.json({ error: "Missing OneSignal keys" }, { status: 500 });
    }

    // Corpo do pedido para a API do OneSignal
    const payload: any = {
      app_id: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
      headings: { pt: title ?? "Mais+Ativo", en: title ?? "Mais+Ativo" },
      contents: { pt: message ?? "", en: message ?? "" },
    };

    // Se forneces uma URL, ao clicar na notificação abre essa página
    if (url) payload.url = url;

    // Enviar para 1 utilizador (filtra pela tag 'uid') ou para todos
    if (uid) {
      payload.filters = [{ field: "tag", key: "uid", relation: "=", value: uid }];
    } else {
      payload.included_segments = ["Subscribed Users"];
    }

    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${process.env.ONESIGNAL_REST_API_KEY!}`, // ⚠️ só no servidor
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
