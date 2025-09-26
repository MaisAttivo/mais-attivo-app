import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

type Daily = { id: string; didWorkout?: boolean; waterLiters?: number; alimentacao100?: boolean; };

async function send(uid: string, title: string, message: string, url?: string) {
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/notify`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ uid, title, message, url })
  });
}

export async function GET() {
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

    // Inatividade 4 dias (nenhum registo diário)
    // (Se entendes “nada preenchido”, usa: ausência de docs. Aqui consideramos ausência de DID WORKOUT e diário vazio pode ser tratado noutras regras)
    // Se preferires “sem QUALQUER daily”, precisas comparar datas. Simplificação: se d.length>0 e o mais recente não é de ontem/hoje por 4 dias consecutivos…
    // Mantemos mensagem pedida:
    const semDaily4 = d.length > 0 ? false : true; // adapta se quiseres regra mais estrita
    if (semDaily4) {
      await send(uid, "Registos diários",
        "Não te esqueças de preencher o teu feedback diário de hoje!", "/daily");
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
