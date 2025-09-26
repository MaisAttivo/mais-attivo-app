import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { serverNotify as send } from "@/lib/serverNotify";

export async function GET() {
  const hourPT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }).format(new Date());
  if (hourPT !== "08") return NextResponse.json({ skipped: true, hourPT });
  const users = await adminDb.collection("users").get();
  const countByCoach: Record<string, number> = {};

  for (const u of users.docs) {
    const coachUid = u.get("coachUid");
    if (!coachUid) continue;
    const uid = u.id;

    const snap = await adminDb.collection(`users/${uid}/dailyFeedback`)
      .orderBy("__name__", "desc").limit(5).get();
    if (snap.size < 5) continue;
    const noWorkout5 = snap.docs.every(x => {
      const v = x.data() as any;
      return (v.didWorkout ?? v.treinou) !== true;
    });
    if (noWorkout5) countByCoach[coachUid] = (countByCoach[coachUid] ?? 0) + 1;
  }

  for (const coachUid of Object.keys(countByCoach)) {
    const n = countByCoach[coachUid];
    await send(coachUid, "Inatividade 5+ dias",
      `${n} cliente(s) sem registos há ≥5 dias.`, "/coach");
  }
  return NextResponse.json({ ok: true });
}
