// app/api/cron/vespera-ci-09h/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDB } from "@/lib/adminDB";
import { ymdLisbon, addDaysYMD } from "@/lib/ymd";
import { forEachUsersPaged } from "@/lib/forEachUsersPaged";
import { serverNotify } from "@/lib/serverNotify";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const uidTest = url.searchParams.get("uid");
    const today = ymdLisbon();
    const tomorrow = addDaysYMD(today, 1);
    const db = getAdminDB();

    const notify = async (uid: string) => {
      if (!dry) {
        await serverNotify(
          uid,
          "Amanhã é dia de Check-in",
          "Atenção que amanhã passam 3 semanas do último check-in. Está na hora de marcar o próximo!",
          "https://mais-attivo-app.vercel.app"
        );
      }
    };

    if (uidTest) {
      const d = await db.doc(`users/${uidTest}`).get();
      if (!d.exists) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
      if (d.get("nextCheckinYMD") === tomorrow) await notify(uidTest);
      return NextResponse.json({ ok: true, test: true, uid: uidTest, willSend: d.get("nextCheckinYMD") === tomorrow, dry });
    }

    let checked = 0, sent = 0;
    await forEachUsersPaged(db, {
      pageSize: 200,
      fields: ["nextCheckinYMD"],
      handler: async (doc) => {
        checked++;
        if (doc.get("nextCheckinYMD") === tomorrow) { await notify(doc.id); sent++; }
      },
    });

    return NextResponse.json({ ok: true, today, tomorrow, checked, sent, dry });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
