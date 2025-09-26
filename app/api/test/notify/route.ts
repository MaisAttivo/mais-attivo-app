export const runtime = "nodejs";

import { NextResponse } from "next/server";

/* ---- Firestore (ADMIN) ---- */
import * as admin from "firebase-admin";

function getAdminDB() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT missing");
    const cred = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(cred),
    });
  }
  return admin.firestore();
}

/* YYYY-MM-DD em Lisboa */
function ymdLisbon(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/* toYMD para Timestamp/Date/string */
function toYMD(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  const dt = typeof v?.toDate === "function" ? v.toDate() : (v instanceof Date ? v : null);
  return dt ? ymdLisbon(dt) : null;
}

/* Envio via /api/notify do teu projeto */
async function serverNotify(uid: string, title: string, message: string, url?: string) {
  const origin = process.env.NEXT_PUBLIC_BASE_URL || "https://mais-ativo-app.vercel.app";
  const res = await fetch(`${origin}/api/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.NOTIFY_BEARER || ""}`,
    },
    body: JSON.stringify({ uid, title, message, url }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const uid = url.searchParams.get("uid");
    const dry = url.searchParams.get("dry") === "1";
    const today = ymdLisbon();

    if (!uid) {
      return NextResponse.json({
        ok: true,
        info: "Teste manual de notificações",
        exemplo: `/api/test/notify?uid=IYB9VqmntIVGJH2XMYnotajIprW2&dry=0`
      });
    }

    const db = getAdminDB();

    // user
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
      return NextResponse.json({ ok: false, error: "User não encontrado", uid }, { status: 404 });
    }
    const u: any = userSnap.data();

    // check-in hoje?
    const nextCheckin = toYMD(u.nextCheckinDate) || u.nextCheckinText || null;
    const isCheckinToday = !!nextCheckin && nextCheckin === today;

    // diário hoje?
    const dailySnap = await db.doc(`users/${uid}/dailyFeedback/${today}`).get();
    const hasDailyToday = dailySnap.exists;

    const actions: any[] = [];

    // 1) diário em falta
    if (!hasDailyToday) {
      const title = "Feedback diário";
      const message = "Não te esqueças de preencher o teu feedback diário de hoje!";
      if (!dry) {
        try {
          await serverNotify(uid, title, message, "https://mais-ativo-app.vercel.app/daily");
          actions.push({ type: "daily-missing", sent: true });
        } catch (e: any) {
          actions.push({ type: "daily-missing", sent: false, error: String(e?.message || e) });
        }
      } else {
        actions.push({ type: "daily-missing", dry: true });
      }
    }

    // 2) check-in hoje
    if (isCheckinToday) {
      const title = "Marcar Check-in";
      const message = "É hoje a avaliação — marca o teu check-in!";
      if (!dry) {
        try {
          await serverNotify(uid, title, message, "https://mais-ativo-app.vercel.app");
          actions.push({ type: "checkin-today", sent: true });
        } catch (e: any) {
          actions.push({ type: "checkin-today", sent: false, error: String(e?.message || e) });
        }
      } else {
        actions.push({ type: "checkin-today", dry: true });
      }
    }

    return NextResponse.json({
      ok: true, uid, today, hasDailyToday, isCheckinToday, dry, actions
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
