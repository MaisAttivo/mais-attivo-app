import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { serverNotify as send } from "@/lib/serverNotify";

const PT = "Europe/Lisbon";
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: PT, year:"numeric", month:"2-digit", day:"2-digit"
}).format(d);

export async function GET() {
  const hourPT = new Intl.DateTimeFormat("en-GB", { timeZone: PT, hour: "2-digit", hour12: false }).format(new Date());
  if (hourPT !== "09") return NextResponse.json({ skipped: true, hourPT });
  const now = new Date();
  const t = new Date(now); t.setDate(t.getDate()+1);
  const tomorrow = ymd(t);

  const users = await adminDb.collection("users").get();
  for (const u of users.docs) {
    const uid = u.id;
    const qs = await adminDb.collection(`users/${uid}/checkins`)
      .where("dateText","==", tomorrow).limit(1).get();
    if (!qs.empty) {
      await send(uid, "Check-in amanhã",
        "Atenção que amanhã passam 3 semanas do último check-in. Está na hora de marcar o próximo!",
        "/checkins");
    }
  }
  return NextResponse.json({ ok: true });
}
