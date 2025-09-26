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
  const today = ymd(new Date());
  const users = await adminDb.collection("users").get();

  const countByCoach: Record<string, number> = {};

  for (const u of users.docs) {
    const coachUid = u.get("coachUid");
    if (!coachUid) continue;
    const uid = u.id;
    const qs = await adminDb.collection(`users/${uid}/checkins`)
      .where("dateText","==", today).limit(1).get();
    if (!qs.empty) countByCoach[coachUid] = (countByCoach[coachUid] ?? 0) + 1;
  }

  for (const coachUid of Object.keys(countByCoach)) {
    const n = countByCoach[coachUid];
    await send(coachUid, "Check-ins de hoje",
      `${n} cliente(s) com CI para marcar hoje.`, "/coach/checkins");
  }
  return NextResponse.json({ ok: true });
}
