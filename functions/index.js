// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function sendPush({ uid, title, message, url, coaches = false }) {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const key = process.env.ONESIGNAL_REST_API_KEY;
  const origin = process.env.ONESIGNAL_API_ORIGIN || "https://api.onesignal.com";
  if (!appId || !key) return;
  const payload = {
    app_id: appId,
    headings: { pt: title, en: title },
    contents: { pt: message, en: message },
  };
  if (url) payload.url = url;
  if (coaches) {
    payload.filters = [{ field: "tag", key: "role", relation: "=", value: "coach" }];
  } else if (uid) {
    payload.filters = [{ field: "tag", key: "uid", relation: "=", value: uid }];
  } else {
    payload.included_segments = ["Subscribed Users"]; // fallback
  }
  await fetch(`${origin}/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Basic ${key}` },
    body: JSON.stringify(payload),
  }).catch(()=>{});
}

async function latestHydrationTarget(userId) {
  try {
    const dSnap = await db.collection(`users/${userId}/dailyFeedback`).orderBy("date","desc").limit(1).get();
    if (!dSnap.empty) {
      const d = dSnap.docs[0].data();
      const w = d.weight ?? d.peso;
      const meta = d.metaAgua ?? (typeof w === "number" ? w*0.05 : undefined);
      if (typeof meta === "number") return Number(meta.toFixed(2));
    }
  } catch {}
  try {
    const cSnap = await db.collection(`users/${userId}/checkins`).orderBy("date","desc").limit(1).get();
    if (!cSnap.empty) {
      const d = cSnap.docs[0].data();
      const w = d.weight ?? d.peso;
      const meta = d.metaAgua ?? (typeof w === "number" ? w*0.05 : undefined);
      if (typeof meta === "number") return Number(meta.toFixed(2));
    }
  } catch {}
  try {
    const qSnap = await db.collection(`users/${userId}/questionnaire`).orderBy("completedAt","desc").limit(1).get();
    if (!qSnap.empty) {
      const d = qSnap.docs[0].data();
      const w = d.weight ?? d.weightKg;
      const meta = d.metaAgua ?? (typeof w === "number" ? w*0.05 : undefined);
      if (typeof meta === "number") return Number(meta.toFixed(2));
    }
  } catch {}
  return 3.0;
}

function daysBetweenUTC(a, b) {
  const ms = Math.abs(new Date(a).setHours(0,0,0,0) - new Date(b).setHours(0,0,0,0));
  return Math.floor(ms / 86400000);
}

// Helper: YYYY-MM-DD (UTC)
function ymdUTC(date) {
  const d = new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()
  ));
  return d.toISOString().slice(0, 10);
}

// Lê o check-in mais recente e escreve cache em users/{userId}
async function updateUserCheckinCache(userId) {
  const ref = db.collection("users").doc(userId).collection("checkins");
  const snap = await ref.orderBy("date", "desc").limit(1).get();

  let lastCheckinDate = null;
  let nextCheckinDate = null;

  if (!snap.empty) {
    const data = snap.docs[0].data();
    const last = data.date?.toDate?.();
    const next = data.nextDate?.toDate?.();
    if (last) lastCheckinDate = ymdUTC(last);
    if (next) nextCheckinDate = ymdUTC(next);
  }

  await db.collection("users").doc(userId).set({
    lastCheckinDate,
    nextCheckinDate,
    checkinMetaUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

// Dispara em qualquer CREATE/UPDATE/DELETE de check-ins
exports.checkinsOnWrite = functions.firestore
  .document("users/{userId}/checkins/{checkinId}")
  .onWrite(async (_change, context) => {
    const { userId } = context.params;
    await updateUserCheckinCache(userId);
  });

// Notificar quando planos são atualizados (treino/dieta)
exports.plansOnWrite = functions.firestore
  .document("users/{userId}/plans/latest")
  .onWrite(async (change, context) => {
    const { userId } = context.params;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return;
    let title = "Planos Atualizados";
    let message = "Planos Atualizados! Qualquer dúvida não hesites em contactar!";
    await sendPush({ uid: userId, title, message, url: "/plans" });
    await db.collection("users").doc(userId).collection("coachNotifications").add({
      kind: "planos_atualizados",
      title,
      message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    }).catch(()=>{});
  });

// 21:00 diário não preenchido; 20:00 domingo weekly; outros checks diários
exports.remindersDaily21 = functions.pubsub
  .schedule("0 21 * * *")
  .timeZone("Europe/Lisbon")
  .onRun(async () => {
    const usersSnap = await db.collection("users").get();
    const today = new Date();
    for (const d of usersSnap.docs) {
      const data = d.data();
      if (data.role === "coach" || data.active === false) continue;
      try {
        const qs = await db.collection(`users/${d.id}/dailyFeedback`).where("date", ">=", admin.firestore.Timestamp.fromDate(new Date(new Date().setHours(0,0,0,0)))).get();
        if (qs.empty) {
          await sendPush({ uid: d.id, title: "Registos diários", message: "Não te esqueças de preencher o teu feedback diário de hoje!", url: "/daily" });
        }
      } catch {}
    }
  });

exports.sundayWeekly20 = functions.pubsub
  .schedule("0 21 * * 0")
  .timeZone("Europe/Lisbon")
  .onRun(async () => {
    const usersSnap = await db.collection("users").get();
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
    for (const d of usersSnap.docs) {
      const data = d.data();
      if (data.role === "coach" || data.active === false) continue;
      try {
        const qs = await db.collection(`users/${d.id}/weekly`).orderBy("weekEndDate","desc").limit(1).get();
        const last = !qs.empty ? qs.docs[0].data().weekEndDate?.toDate?.() : null;
        if (!last || last.getTime() < weekAgo.getTime()) {
          await sendPush({ uid: d.id, title: "Registo semanal", message: "Ainda vais a tempo de preencher o teu feedback semanal de hoje!", url: "/weekly" });
        }
      } catch {}
    }
  });

exports.mondayWeekly20 = functions.pubsub
  .schedule("0 20 * * 1")
  .timeZone("Europe/Lisbon")
  .onRun(async () => {
    const usersSnap = await db.collection("users").get();
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
    for (const d of usersSnap.docs) {
      const data = d.data();
      if (data.role === "coach" || data.active === false) continue;
      try {
        const qs = await db.collection(`users/${d.id}/weekly`).orderBy("weekEndDate","desc").limit(1).get();
        const last = !qs.empty ? qs.docs[0].data().weekEndDate?.toDate?.() : null;
        if (!last || last.getTime() < weekAgo.getTime()) {
          await sendPush({ uid: d.id, title: "Registo semanal", message: "Não chegaste a enviar o teu feedback semanal. Envia mensagem ao coach com o teu feedback, por favor.", url: "/weekly" });
        }
      } catch {}
    }
  });

exports.healthChecksDaily09 = functions.pubsub
  .schedule("0 9 * * *")
  .timeZone("Europe/Lisbon")
  .onRun(async () => {
    const usersSnap = await db.collection("users").get();
    const now = new Date();
    for (const d of usersSnap.docs) {
      const data = d.data();
      if (data.role === "coach" || data.active === false) continue;
      // água < meta em média 3 dias
      try {
        const meta = await latestHydrationTarget(d.id);
        const qs = await db.collection(`users/${d.id}/dailyFeedback`).orderBy("date","desc").limit(3).get();
        if (!qs.empty && qs.size >= 3) {
          let sum=0, count=0;
          qs.forEach(doc=>{ const x=doc.data(); const v=x.waterLiters ?? x.aguaLitros; if (typeof v === 'number') {sum+=v; count++;}});
          if (count>=3 && (sum/count) < meta) {
            await sendPush({ uid: d.id, title: "Hidratação", message: "Tens andado a falhar com a água! Vamos atingir a meta de água diária!", url: "/daily" });
          }
        }
      } catch {}
      // inatividade 4 dias
      try {
        const qs = await db.collection(`users/${d.id}/dailyFeedback`).orderBy("date","desc").limit(1).get();
        const last = !qs.empty ? qs.docs[0].data().date?.toDate?.() : null;
        if (!last || daysBetweenUTC(last, now) >= 4) {
          await sendPush({ uid: d.id, title: "Registos diários", message: "Não te esqueças de preencher o teu feedback diário de hoje!", url: "/daily" });
        }
      } catch {}
      // não treina há 5 dias
      try {
        const qs = await db.collection(`users/${d.id}/dailyFeedback`).orderBy("date","desc").limit(30).get();
        let lastTrain = null;
        qs.forEach(doc=>{ const x=doc.data(); if ((x.didWorkout===true || x.treinou===true) && !lastTrain) lastTrain = x.date?.toDate?.() || null; });
        if (!lastTrain || daysBetweenUTC(lastTrain, now) >= 5) {
          await sendPush({ uid: d.id, title: "Treinos", message: "Está na hora de voltar aos treinos!", url: "/daily" });
        }
      } catch {}
      // alimentação 3 dias sem 100%
      try {
        const qs = await db.collection(`users/${d.id}/dailyFeedback`).orderBy("date","desc").limit(3).get();
        if (!qs.empty && qs.size >= 3) {
          let okCount=0; qs.forEach(doc=>{ const x=doc.data(); if (x.alimentacao100 === true) okCount++; });
          if (okCount === 0) {
            await sendPush({ uid: d.id, title: "Alimentação", message: "Não andas a cumprir bem a alimentação ultimamente, vamos voltar ao bom ritmo!", url: "/daily" });
          }
        }
      } catch {}
      // check-in amanhã
      try {
        const u = (await db.collection("users").doc(d.id).get()).data() || {};
        const next = u.nextCheckinDate?.toDate?.() || null;
        if (next) {
          const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(0,0,0,0);
          const nx = new Date(next); nx.setHours(0,0,0,0);
          if (nx.getTime() === tomorrow.getTime()) {
            await sendPush({ uid: d.id, title: "Marcar Check‑in", message: "Atenção que amanhã passam 3 semanas do último check-in. Está na hora de marcar o próximo!", url: "/checkin" });
          }
        }
      } catch {}
    }
  });

// Avisos para coaches: CI hoje e inativos 5d
exports.coachDaily08 = functions.pubsub
  .schedule("0 8 * * *")
  .timeZone("Europe/Lisbon")
  .onRun(async () => {
    const usersSnap = await db.collection("users").get();
    const todayYMD = new Date(); todayYMD.setHours(0,0,0,0);
    let due=0, inactive5=0;
    const now = new Date();
    for (const d of usersSnap.docs) {
      const u = d.data();
      if (u.role === "coach" || u.active === false) continue;
      try {
        const nx = u.nextCheckinDate?.toDate?.() || null;
        if (nx) { const x = new Date(nx); x.setHours(0,0,0,0); if (x.getTime() === todayYMD.getTime()) due++; }
      } catch {}
      try {
        const qs = await db.collection(`users/${d.id}/dailyFeedback`).orderBy("date","desc").limit(1).get();
        const last = !qs.empty ? qs.docs[0].data().date?.toDate?.() : null;
        if (!last || daysBetweenUTC(last, now) >= 5) inactive5++;
      } catch {}
    }
    if (due>0) await sendPush({ coaches: true, title: "Check‑ins de hoje", message: `${due} cliente(s) com CI para marcar hoje.` });
    if (inactive5>0) await sendPush({ coaches: true, title: "Inatividade 5+ dias", message: `${inactive5} cliente(s) sem registos há ≥5 dias.` });
  });
