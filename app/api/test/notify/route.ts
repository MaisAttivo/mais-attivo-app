// app/api/test/notify/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { serverNotify } from "@/lib/serverNotify";

function getAdminDB() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT missing");
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(raw)),
    });
  }
  return admin.firestore();
}

function ymdLisbon(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function toYMD(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  const dt = typeof v?.toDate === "function" ? v.toDate() : (v instanceof Date ? v : null);
  return dt ? ymdLisbon(dt) : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const uid = url.searchParams.get("uid");
    const dry = url.searchParams.get("dry") === "1";
    const ping = url.searchParams.get("ping") === "1";
    const today = ymdLisbon();

    if (ping) return NextResponse.json({ ok: true, msg: "pong" });

    if (!uid) {
      return NextResponse.json({
        ok: true,
        info: "Teste manual: /api/test/notify?uid=UID&dry=1|0",
      });
    }

    const db = getAdminDB();

    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) return NextResponse.json({ ok: false, error: "User não encontrado" }, { status: 404 });
    const u: any = userSnap.data();

    const nextCheckin = toYMD(u.nextCheckinDate) || u.nextCheckinText || null;
    const isCheckinToday = !!nextCheckin && nextCheckin === today;

    const dailySnap = await db.doc(`users/${uid}/dailyFeedback/${today}`).get();
    const hasDailyToday = dailySnap.exists;

    const actions: any[] = [];

    if (!hasDailyToday) {
      const title = "Feedback diário";
      const message = "Não te esqueças de preencher o teu feedback diário de hoje!";
      if (!dry) {
        try { await serverNotify(uid, title, message, "https://mais-attivo-app.vercel.app/daily"); actions.push({ type: "daily-missing", sent: true }); }
        catch (e:any) { actions.push({ type: "daily-missing", sent: false, error: String(e?.message || e) }); }
      } else actions.push({ type: "daily-missing", dry: true });
    }

    if (isCheckinToday) {
      const title = "Marcar Check-in";
      const message = "É hoje a avaliação — marca o teu check-in!";
      if (!dry) {
        try { await serverNotify(uid, title, message, "https://mais-attivo-app.vercel.app"); actions.push({ type: "checkin-today", sent: true }); }
        catch (e:any) { actions.push({ type: "checkin-today", sent: false, error: String(e?.message || e) }); }
      } else actions.push({ type: "checkin-today", dry: true });
    }

    return NextResponse.json({ ok: true, uid, today, hasDailyToday, isCheckinToday, dry, actions });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
