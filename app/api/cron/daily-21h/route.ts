import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

const PT = "Europe/Lisbon";
const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: PT, year:"numeric", month:"2-digit", day:"2-digit"
}).format(new Date());

async function send(uid: string, title: string, message: string, url?: string) {
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/notify`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ uid, title, message, url })
  });
}

export async function GET() {
  const YMD = today();
  const users = await adminDb.collection("users").get();
  for (const u of users.docs) {
    const uid = u.id;
    const todayDoc = await adminDb.doc(`users/${uid}/dailyFeedback/${YMD}`).get();
    if (!todayDoc.exists) {
      await send(uid, "Registos diários",
        "Não te esqueças de preencher o teu feedback diário de hoje!", "/daily");
    }
  }
  return NextResponse.json({ ok: true });
}
