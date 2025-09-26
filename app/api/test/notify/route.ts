export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { serverNotify } from "@/lib/serverNotify";

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

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return NextResponse.json({ error: "User não encontrado" }, { status: 404 });

  const u = snap.data() as any;
  const nextCheckin = toYMD(u.nextCheckinDate);
  const isCheckinToday = nextCheckin === today;

  const dailySnap = await getDoc(doc(db, `users/${uid}/dailyFeedback/${today}`));
  const hasDailyToday = dailySnap.exists();

  const actions: any[] = [];

  if (!hasDailyToday) {
    const msg = "Não te esqueças do feedback diário de hoje!";
    actions.push({ type: "daily-missing", msg });
    if (!dry) await serverNotify(uid, "Feedback diário", msg);
  }

  if (isCheckinToday) {
    const msg = "Hoje é dia de avaliação — marca o teu check-in!";
    actions.push({ type: "checkin-today", msg });
    if (!dry) await serverNotify(uid, "Check-in", msg);
  }

  return NextResponse.json({ ok: true, uid, today, dry, actions });
}
