// app/api/cron/coach-08-inatividade/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDB } from "@/lib/adminDB";
import { ymdLisbon, diffDays } from "@/lib/ymd";
import { forEachUsersPaged } from "@/lib/forEachUsersPaged";
import { serverNotify } from "@/lib/serverNotify";

export async function GET() {
  try {
    const db = getAdminDB();
    const today = ymdLisbon();
    const coachUid = process.env.COACH_UID;
    if (!coachUid) return NextResponse.json({ ok:false, error:"COACH_UID missing" }, { status:500 });

    let count = 0;
    await forEachUsersPaged(db, {
      pageSize: 400,
      fields: ["lastDailyYMD"],
      handler: async (doc) => {
        let lastDaily = doc.get("lastDailyYMD");
        if (!lastDaily) {
          const s = await db.collection(`users/${doc.id}/dailyFeedback`).orderBy("date","desc").limit(1).get();
          lastDaily = s.empty ? null : s.docs[0].id;
        }
        if (!lastDaily || diffDays(today, lastDaily) >= 5) count++;
      },
    });

    if (count > 0) {
      await serverNotify(coachUid, "Inatividade 5+ dias", `${count} cliente(s) sem registos há ≥5 dias.`);
    }
    return NextResponse.json({ ok:true, today, count });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 });
  }
}
