// app/api/cron/coach-08-checkins/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDB } from "@/lib/adminDB";
import { ymdLisbon } from "@/lib/ymd";
import { forEachUsersPaged } from "@/lib/forEachUsersPaged";
import { serverNotify } from "@/lib/serverNotify";

export async function GET() {
  try {
    const db = getAdminDB();
    const today = ymdLisbon();
    const coachUid = process.env.COACH_UID; // define isto no Vercel

    if (!coachUid) return NextResponse.json({ ok:false, error:"COACH_UID missing" }, { status:500 });

    let count = 0;
    await forEachUsersPaged(db, {
      pageSize: 400, // dá para mais rápido
      fields: ["nextCheckinYMD"],
      handler: async (doc) => {
        if (doc.get("nextCheckinYMD") === today) count++;
      },
    });

    if (count > 0) {
      await serverNotify(coachUid, "Check-ins de hoje", `${count} cliente(s) com CI para marcar hoje.`);
    }
    return NextResponse.json({ ok:true, today, count });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 });
  }
}
