import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

const PT = "Europe/Lisbon";
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: PT, year:"numeric", month:"2-digit", day:"2-digit"
}).format(d);

async function send(uid: string, title: string, message: string, url?: string) {
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/notify`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ uid, title, message, url })
  });
}

export async function GET() {
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
