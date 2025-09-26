// app/api/cron/daily-21h/route.ts
export const runtime = "nodejs";

import * as admin from "firebase-admin";
import { NextResponse } from "next/server";
import { ymdLisbon } from "@/lib/ymd";
import { forEachUsersPaged } from "@/lib/forEachUsersPaged";
import { mapLimit } from "@/lib/concurrency";
import { serverNotify } from "@/lib/serverNotify";

function getAdminDB() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT!;
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.firestore();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const uidTest = url.searchParams.get("uid");
    const today = ymdLisbon();
    const db = getAdminDB();

    // TEST MODE (um só utilizador)
    if (uidTest) {
      const doc = await db.doc(`users/${uidTest}`).get();
      if (!doc.exists) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });

      const u: any = doc.data() || {};
      const lastDaily = u.lastDailyYMD ?? null;

      let needs = lastDaily !== today; // se guardas lastDailyYMD no doc
      // --- TEMPORÁRIO se não guardas lastDailyYMD:
      // const dSnap = await db.doc(`users/${uidTest}/dailyFeedback/${today}`).get();
      // needs = !dSnap.exists;

      if (!needs) {
        return NextResponse.json({ ok: true, test: true, uid: uidTest, skipped: true });
      }

      if (!dry) {
        await serverNotify(
          uidTest,
          "Feedback diário",
          "Não te esqueças de preencher o teu feedback diário de hoje!",
          "https://mais-attivo-app.vercel.app/daily"
        );
      }
      return NextResponse.json({ ok: true, test: true, uid: uidTest, sent: !dry });
    }

    // PRODUÇÃO — percorre users em páginas (200) e envia em lotes com concorrência limitada
    let totalChecked = 0;
    let totalSent = 0;

    await forEachUsersPaged(db, {
      pageSize: 200,
      // se guardas campos derivados, lê só o que precisas:
      fields: ["lastDailyYMD"], // remove se ainda não tens
      handler: async (doc) => {
        totalChecked++;
        const uid = doc.id;
        const u: any = doc.data() || {};
        let needs = u.lastDailyYMD !== today;

        // --- TEMPORÁRIO se não tens lastDailyYMD no user:
        // const dSnap = await db.doc(`users/${uid}/dailyFeedback/${today}`).get();
        // needs = !dSnap.exists;

        if (!needs) return;

        // Envio em lotes com limite de concorrência (ex.: 8)
        await mapLimit([uid], 8, async (id) => {
          if (!dry) {
            try {
              await serverNotify(
                id,
                "Feedback diário",
                "Não te esqueças de preencher o teu feedback diário de hoje!",
                "https://mais-attivo-app.vercel.app/daily"
              );
              totalSent++;
            } catch (e) {
              // loga se quiseres
            }
          }
        });
      },
    });

    return NextResponse.json({ ok: true, today, totalChecked, totalSent, dry });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
