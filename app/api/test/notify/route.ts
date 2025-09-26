export const runtime = "nodejs";

import { NextResponse } from "next/server";

// carrega só quando necessário para evitar erros de import
async function loadDeps() {
  const { db } = await import("@/lib/firebase");
  const { doc, getDoc } = await import("firebase/firestore");
  const { serverNotify } = await import("@/lib/serverNotify");
  return { db, doc, getDoc, serverNotify };
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
    const ping = url.searchParams.get("ping");
    if (ping === "1") {
      return NextResponse.json({ ok: true, msg: "pong" }); // teste rápido
    }

    const uid = url.searchParams.get("uid");
    const dry = url.searchParams.get("dry") === "1";
    const today = ymdLisbon();

    if (!uid) {
      return NextResponse.json({
        ok: true,
        info: "Teste manual de notificações",
        exemplo: `/api/test/notify?uid=SEU_UID&dry=0`,
      });
    }

    const { db, doc, getDoc, serverNotify } = await loadDeps();

    // carrega o utilizador
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      return NextResponse.json({ ok: false, error: "User não encontrado", uid }, { status: 404 });
    }
    const u: any = snap.data();
    const nextCheckin = toYMD(u.nextCheckinDate) || u.nextCheckinText || null;
    const isCheckinToday = nextCheckin === today;

    // diário de hoje?
    const dailySnap = await getDoc(doc(db, `users/${uid}/dailyFeedback/${today}`));
    const hasDailyToday = dailySnap.exists();

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
        actions.push({ type: "daily-missing", sent: false, dry: true });
      }
    }

    // 2) é hoje o check-in
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
        actions.push({ type: "checkin-today", sent: false, dry: true });
      }
    }

    return NextResponse.json({
      ok: true, uid, today, hasDailyToday, isCheckinToday, dry, actions
    });
  } catch (e: any) {
    // devolve o erro em JSON para sabermos a causa
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
