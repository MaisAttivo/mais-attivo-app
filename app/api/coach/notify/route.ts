export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { uid, title, message, url } = await req.json();

    const bearer = (process.env.NOTIFY_BEARER || "").trim();
    if (!bearer) return NextResponse.json({ error: "Server missing NOTIFY_BEARER" }, { status: 500 });

    // Compute origin for same-app call
    const xfProto = req.headers.get("x-forwarded-proto") || "https";
    const xfHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const envOrigin = (process.env.NEXT_PUBLIC_BASE_URL || "").trim();
    const origin = envOrigin || (xfHost ? `${xfProto}://${xfHost}` : "https://mais-ativo-app.vercel.app");

    const res = await fetch(`${origin.replace(/\/$/, "")}/api/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearer}`,
      },
      body: JSON.stringify({ uid, title, message, url }),
    });

    const text = await res.text();
    try { return NextResponse.json(JSON.parse(text), { status: res.status }); }
    catch { return NextResponse.json({ ok: res.ok, raw: text }, { status: res.status }); }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
