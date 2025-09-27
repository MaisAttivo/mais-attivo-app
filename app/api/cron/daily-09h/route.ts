// app/api/cron/daily-09h/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDB } from "@/lib/adminDB";
import { ymdLisbon, diffDays } from "@/lib/ymd";
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

    const evaluateUser = async (uid: string, u: any) => {
      const acts: { key: string; title: string; message: string; url?: string }[] = [];

      // Água (usa derivados; fallback: lê últimos 3 dailies)
      let waterAvg3d = u?.waterAvg3d;
      let waterGoal = u?.waterGoal ?? 3.0;
      if (waterAvg3d == null) {
        const snap = await db.collection(`users/${uid}/dailyFeedback`).orderBy("date", "desc").limit(3).get();
        if (!snap.empty) {
          const vals: number[] = [];
          for (const d of snap.docs) {
            const w = d.get("waterLiters");
            if (typeof w === "number") vals.push(w);
            if (typeof d.get("metaAgua") === "number") waterGoal = d.get("metaAgua");
          }
          if (vals.length) waterAvg3d = +(vals.reduce((a,b)=>a+b, 0)/vals.length).toFixed(2);
        }
      }
      if (waterAvg3d != null && waterAvg3d < waterGoal) {
        acts.push({
          key: "agua",
          title: "Hidratação",
          message: "Tens andado a falhar com a água! Vamos atingir a meta de água diária!",
        });
      }

      // Inatividade (sem daily) >= 4 dias
      let lastDaily = u?.lastDailyYMD;
      if (!lastDaily) {
        const snap = await db.collection(`users/${uid}/dailyFeedback`).orderBy("date", "desc").limit(1).get();
        lastDaily = snap.empty ? null : snap.docs[0].id;
      }
      if (!lastDaily || diffDays(today, lastDaily) >= 4) {
        acts.push({
          key: "inatividade",
          title: "Não te esqueças do diário!",
          message: "Não te esqueças de preencher o teu feedback diário de hoje!",
          url: "https://mais-attivo-app.vercel.app/daily",
        });
      }

      // Sem treino >= 5 dias
      let lastWorkout = u?.lastWorkoutYMD;
      if (!lastWorkout) {
        const snap = await db.collection(`users/${uid}/dailyFeedback`).where("didWorkout", "==", true).orderBy("date", "desc").limit(1).get();
        lastWorkout = snap.empty ? null : snap.docs[0].id;
      }
      if (!lastWorkout || diffDays(today, lastWorkout) >= 5) {
        acts.push({
          key: "treino",
          title: "Volta aos treinos 💪",
          message: "Está na hora de voltar aos treinos!",
        });
      }

      // Alimentação 3 dias sem 100%
      let lastMeal100 = u?.lastMeal100YMD;
      if (!lastMeal100) {
        const snap = await db.collection(`users/${uid}/dailyFeedback`).where("alimentacao100", "==", true).orderBy("date", "desc").limit(1).get();
        lastMeal100 = snap.empty ? null : snap.docs[0].id;
      }
      if (!lastMeal100 || diffDays(today, lastMeal100) >= 3) {
        acts.push({
          key: "alimentacao",
          title: "Alimentação",
          message: "Não andas a cumprir bem a alimentação ultimamente, vamos voltar ao bom ritmo!",
        });
      }

      return acts;
    };

    if (uidTest) {
      const doc = await db.doc(`users/${uidTest}`).get();
      if (!doc.exists) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
      const acts = await evaluateUser(uidTest, doc.data());
      if (!dry) for (const a of acts) await serverNotify(uidTest, a.title, a.message, a.url);
      return NextResponse.json({ ok: true, test: true, uid: uidTest, actions: acts, sent: !dry });
    }

    let checked = 0, sent = 0;
    await forEachUsersPaged(db, {
      pageSize: 200,
      fields: ["lastDailyYMD","lastWorkoutYMD","lastMeal100YMD","meal100Streak","waterAvg3d","waterGoal"],
      handler: async (doc) => {
        checked++;
        const uid = doc.id;
        const acts = await evaluateUser(uid, doc.data());

        // envia com limite de concorrência
        await mapLimit(acts, 8, async (a) => {
          if (!dry) {
            try { await serverNotify(uid, a.title, a.message, a.url); sent++; } catch {}
          }
        });
      },
    });

    return NextResponse.json({ ok: true, today, checked, sent, dry });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
