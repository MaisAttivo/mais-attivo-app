import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { serverNotify as send } from "@/lib/serverNotify";

type Daily = { id: string; didWorkout?: boolean; waterLiters?: number; alimentacao100?: boolean; };

export async function GET() {
  const hourPT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }).format(new Date());
  if (hourPT !== "09") return NextResponse.json({ skipped: true, hourPT });
  const users = await adminDb.collection("users").get();

  for (const u of users.docs) {
    const uid = u.id;
    const metaAgua = Number(u.get("metaAgua") ?? 3);

    const snap = await adminDb.collection(`users/${uid}/dailyFeedback`)
      .orderBy("__name__", "desc").limit(7).get();
    const d: Daily[] = snap.docs.map(x => {
      const v = x.data() as any;
      return {
        id: x.id,
        didWorkout: v.didWorkout ?? v.treinou ?? false,
        waterLiters: Number(v.waterLiters ?? v.aguaLitros ?? 0),
        alimentacao100: !!(v.alimentacao100 ?? v.alimentacaoOk),
      };
    });

    // Água < meta durante 3 dias seguidos
    const ult3 = d.slice(0,3);
    if (ult3.length === 3 && ult3.every(x => (x.waterLiters ?? 0) < metaAgua)) {
      await send(uid, "Hidratação",
        "Tens andado a falhar com a água! Vamos atingir a meta de água diária!", "/daily");
    }

    // Inatividade 4 dias (sem QUALQUER daily nos últimos 4 dias, em Europe/Lisbon)
    const todayYMD = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    function diffYMD(a: string, b: string) {
      const [ay, am, ad] = a.split("-").map(Number);
      const [by, bm, bd] = b.split("-").map(Number);
      const aUTC = Date.UTC(ay, am - 1, ad);
      const bUTC = Date.UTC(by, bm - 1, bd);
      return Math.floor((bUTC - aUTC) / 86400000);
    }
    const latestId = d[0]?.id || null;
    const daysSinceLast = latestId ? diffYMD(latestId, todayYMD) : 999;
    if (daysSinceLast >= 4) {
      await send(uid, "Registos diários",
        "Estás há 4 dias sem preencher o feedback diário. Vamos retomar hoje!", "/daily");
    }

    // Sem treino ≥5 dias
    if (d.length >= 5 && d.slice(0,5).every(x => x.didWorkout !== true)) {
      await send(uid, "Voltar aos treinos",
        "Está na hora de voltar aos treinos!", "/daily");
    }

    // Alimentação 3 dias seguidos sem 100%
    if (d.length >= 3 && d.slice(0,3).every(x => x.alimentacao100 !== true)) {
      await send(uid, "Alimentação",
        "Não andas a cumprir bem a alimentação ultimamente, vamos voltar ao bom ritmo!", "/daily");
    }
  }

  return NextResponse.json({ ok: true });
}
