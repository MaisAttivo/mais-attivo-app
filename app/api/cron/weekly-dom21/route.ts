// app/api/cron/weekly-dom21/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDB } from "@/lib/adminDB";
import { startOfISOWeekYMD } from "@/lib/ymd";
import { forEachUsersPaged } from "@/lib/forEachUsersPaged";
import { serverNotify } from "@/lib/serverNotify";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const uidTest = url.searchParams.get("uid");
    const weekStart = startOfISOWeekYMD(new Date());
    const db = getAdminDB();

    const should = (u:any) => u?.lastWeeklyYMD !== weekStart && u?.weeklyThisWeek !== true;

    const hit = async (uid: string) => {
      if (!dry)
        await serverNotify(
          uid,
          "Feedback semanal",
          "Ainda vais a tempo de preencher o teu feedback semanal de hoje!",
          "https://mais-attivo-app.vercel.app/weekly"
        );
    };

    if (uidTest) {
      const d = await db.doc(`users/${uidTest}`).get();
      const will = should(d.data());
      if (will) await hit(uidTest);
      return NextResponse.json({ ok: true, test: true, uid: uidTest, willSend: will, dry });
    }

    let checked = 0, sent = 0;
    await forEachUsersPaged(db, {
      pageSize: 200,
      fields: ["lastWeeklyYMD", "weeklyThisWeek"],
      handler: async (doc) => {
        checked++;
        if (should(doc.data())) { await hit(doc.id); sent++; }
      },
    });

    return NextResponse.json({ ok: true, weekStart, checked, sent, dry });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 });
  }
}
