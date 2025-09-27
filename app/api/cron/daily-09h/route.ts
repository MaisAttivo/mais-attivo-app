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

    // Lê últimos K dailies (sem índices compostos)
    async function getLastKDailies(uid: string, k = 7) {
      const s = await db
        .collection(`users/${uid}/dailyFeedback`)
        .orderBy("date", "desc")
        .limit(k)
        .get();
      // devolve [{id: 'YYYY-MM-DD', ...data}]
      return s.docs.map(d => ({ id: d.id, data: d.data() as any }));
    }

    const evaluateUser = async (uid: string, u: any) => {
      const acts: { key: string; title: string; message: string; url?: string }[] = [];

      // ---------- ÁGUA: derivados ou fallback (média 3 dias) ----------
      let waterAvg3d = u?.waterAvg3d as number | null | undefined;
      let waterGoal = (u?.waterGoal as number | undefined) ?? 3.0;

      if (waterAvg3d == null) {
        const last = await getLastKDailies(uid, 3);
        const vals: number[] = [];
        for (const d of last) {
          if (typeof d.data.metaAgua === "number") waterGoal = d.data.metaAgua;
          if (typeof d.data.waterLiters === "number") vals.push(d.data.waterLiters);
        }
        if (vals.length) {
          waterAvg3d = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
        }
      }

      if (waterAvg3d != null && waterAvg3d < waterGoal) {
        acts.push({
          key: "agua",
          title: "Hidratação",
          message: "Tens andado a falhar com a água! Vamos atingir a meta de água diária!",
        });
      }

      // ---------- INATIVIDADE (sem daily) >= 4 dias ----------
      let lastDaily = u?.lastDailyYMD as string | undefined | null;
      if (!lastDaily) {
        const last1 = await getLastKDailies(uid, 1);
        lastDaily = last1[0]?.id ?? null;
      }
      if (!lastDaily || diffDays(today, lastDaily) >= 4) {
        acts.push({
          key: "inatividade",
          title: "Não te esqueças do diário!",
          message: "Não te esqueças de preencher o teu feedback diário de hoje!",
          url: "https://mais-attivo-app.vercel.app/daily",
        });
      }

      // ---------- SEM TREINO >= 5 dias (filtra em memória) ----------
      let lastWorkout = u?.lastWorkoutYMD as string | undefined | null;
      if (!lastWorkout) {
        const last = await getLastKDailies(uid, 7);
        const w = last.find(d => d.data?.didWorkout === true);
        lastWorkout = w?.id ?? null;
      }
      if (!lastWorkout || diffDays(today, lastWorkout) >= 5) {
        acts.push({
          key: "treino",
          title: "Volta aos treinos 💪",
          message: "Está na hora de voltar aos treinos!",
        });
      }

      // ---------- ALIMENTAÇÃO: 3 dias sem 100% (filtra em memória) ----------
      let lastMeal100 = u?.lastMeal100YMD as string | undefined | null;
      if (!lastMeal100) {
        const last = await getLastKDailies(uid, 7);
        const m = last.find(d => d.data?.alimentacao100 === true);
        lastMeal100 = m?.id ?? null;
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

    // -------- TESTE com ?uid=... --------
    if (uidTest) {
      const doc = await db.doc(`users/${uidTest}`).get();
      if (!doc.exists) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
      const acts = await evaluateUser(uidTest, doc.data());
      if (!dry) for (const a of acts) await serverNotify(uidTest, a.title, a.message, a.url);
      return NextResponse.json({ ok: true, test: true, uid: uidTest, actions: acts, sent: !dry });
    }

    // -------- PRODUÇÃO --------
    let checked = 0, sent = 0;
    await forEachUsersPaged(db, {
      pageSize: 200,
      fields: ["lastDailyYMD","lastWorkoutYMD","lastMeal100YMD","meal100Streak","waterAvg3d","waterGoal"],
      handler: async (doc) => {
        checked++;
        const uid = doc.id;
        const acts = await evaluateUser(uid, doc.data());
        await mapLimit(acts, 8, async (a) => {
          if (!dry) {
            try { await serverNotify(uid, a.title, a.message, a.url); sent++; } catch {}
          }
        });
      },
    });

    return NextResponse.json({ ok: true, today, checked, sent, dry });
  } catch (e: any) {
    // ajuda a ver rapidamente o motivo no Vercel
    console.error("daily-09h error:", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
