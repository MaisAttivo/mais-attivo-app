// app/api/cron/daily-21h/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDB } from "@/lib/adminDB";
import { ymdLisbon } from "@/lib/ymd";
import { forEachUsersPaged } from "@/lib/forEachUsersPaged";
import { mapLimit } from "@/lib/concurrency";
import { serverNotify } from "@/lib/serverNotify";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const uidTest = url.searchParams.get("uid");
    const today = ymdLisbon();
    const db = getAdminDB();

    const shouldSend = async (uid: string, data: any) => {
      // preferimos lastDailyYMD; fallback lê subcoleção de hoje
      if (data?.lastDailyYMD) return data.lastDailyYMD !== today;
      const snap = await db.doc(`users/${uid}/dailyFeedback/${today}`).get();
      return !snap.exists;
    };

    if (uidTest) {
      const doc = await db.doc(`users/${uidTest}`).get();
      if (!doc.exists) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
      const need = await shouldSend(uidTest, doc.data());
      if (need && !dry)
        await serverNotify(uidTest, "Feedback diário", "Não te esqueças de preencher o feedback de hoje!", "https://mais-attivo-app.vercel.app/daily");
      return NextResponse.json({ ok: true, test: true, uid: uidTest, sent: need && !dry });
    }

    let checked = 0, sent = 0;
    await forEachUsersPaged(db, {
      pageSize: 200,
      fields: ["lastDailyYMD"],
      handler: async (doc) => {
        checked++;
        const uid = doc.id;
        const need = await shouldSend(uid, doc.data());
        if (!need) return;

        await mapLimit([uid], 8, async (id) => {
          if (!dry) {
            try {
              await serverNotify(
                id,
                "Feedback diário",
                "Não te esqueças de preencher o feedback de hoje!",
                "https://mais-attivo-app.vercel.app/daily"
              );
              sent++;
            } catch {}
          }
        });
      },
    });

    return NextResponse.json({ ok: true, today, checked, sent, dry });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
