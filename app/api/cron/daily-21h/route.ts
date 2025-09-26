import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { serverNotify as send } from "@/lib/serverNotify";

const PT = "Europe/Lisbon";
const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: PT, year:"numeric", month:"2-digit", day:"2-digit"
}).format(new Date());

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
