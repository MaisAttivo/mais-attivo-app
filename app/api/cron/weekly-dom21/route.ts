import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { serverNotify as send } from "@/lib/serverNotify";

function startOfISOWeek(d = new Date()) {
  const day = (d.getUTCDay()+6)%7;
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()-day));
  s.setUTCHours(0,0,0,0); return s;
}
function weekId(d = new Date()) {
  const s = startOfISOWeek(d);
  const year = s.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year,0,1));
  const diff = Math.floor((+s - +jan1)/86400000);
  const w = Math.ceil((diff + (jan1.getUTCDay()||7))/7);
  return `${year}-W${String(w).padStart(2,"0")}`;
}

export async function GET() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date());
  const hour = parts.find(p => p.type === "hour")?.value;
  const wk = parts.find(p => p.type === "weekday")?.value;
  if (!(hour === "21" && wk === "Sun")) return NextResponse.json({ skipped: true, hour, weekday: wk });
  const wid = weekId(new Date());
  const users = await adminDb.collection("users").get();
  for (const u of users.docs) {
    const uid = u.id;
    const w = await adminDb.doc(`users/${uid}/weeklyFeedback/${wid}`).get();
    if (!w.exists) {
      await send(uid, "Feedback semanal",
        "Ainda vais a tempo de preencher o teu feedback semanal de hoje!", "/weekly");
    }
  }
  return NextResponse.json({ ok: true });
}
