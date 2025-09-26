// lib/derived.ts
import { getAdminDB } from "./adminDB";
import { ymdLisbon, startOfISOWeekYMD } from "./ymd";

/**
 * Recalcula campos derivados do user com base nos últimos dailies.
 * Chama isto APÓS gravar o daily de hoje.
 */
export async function updateDerivedAfterDaily(uid: string) {
  const db = getAdminDB();
  const today = ymdLisbon();

  // lê últimos 7 dailies
  const snap = await db
    .collection(`users/${uid}/dailyFeedback`)
    .orderBy("date", "desc")
    .limit(7)
    .get();

  let lastDailyYMD = "";
  let lastWorkoutYMD = "";
  let lastMeal100YMD = "";
  let meal100Streak = 0;

  // média de água 3 dias
  const waters: number[] = [];
  const goalFromDaily: number[] = []; // se guardas metaAgua no daily
  for (const d of snap.docs) {
    const data: any = d.data();
    const ymd = d.id; // assumindo docId = YYYY-MM-DD
    if (!lastDailyYMD) lastDailyYMD = ymd;
    if (data.didWorkout === true && !lastWorkoutYMD) lastWorkoutYMD = ymd;
    if (data.alimentacao100 === true && !lastMeal100YMD) lastMeal100YMD = ymd;
    if (typeof data.waterLiters === "number") waters.push(data.waterLiters);
    if (typeof data.metaAgua === "number") goalFromDaily.push(data.metaAgua);
  }

  // streak alimentação 100% – de trás para a frente (asc)
  const asc = snap.docs.slice().reverse();
  for (const d of asc) {
    const data: any = d.data();
    const ymd = d.id;
    if (data.alimentacao100 === true) meal100Streak++;
    else {
      // se hoje não foi 100%, termina a contagem
      if (ymd === today) break;
      else meal100Streak = 0;
    }
  }

  const waterAvg3d =
    waters.length === 0
      ? null
      : +(waters.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, waters.length)).toFixed(2);

  // meta de água: do daily mais recente com meta ou guarda no doc do user
  // (mantemos valor já existente se não houver)
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const curGoal = userSnap.get("waterGoal");
  const waterGoal = goalFromDaily[0] ?? curGoal ?? 3.0;

  await userRef.set(
    {
      lastDailyYMD: lastDailyYMD || today,
      lastWorkoutYMD: lastWorkoutYMD || userSnap.get("lastWorkoutYMD") || null,
      lastMeal100YMD: lastMeal100YMD || userSnap.get("lastMeal100YMD") || null,
      meal100Streak: meal100Streak,
      waterAvg3d: waterAvg3d,
      waterGoal,
    },
    { merge: true }
  );
}

/**
 * Atualiza derivados quando o WEEKLY é submetido (no fim de semana).
 */
export async function updateDerivedAfterWeekly(uid: string) {
  const db = getAdminDB();
  const weekStart = startOfISOWeekYMD(new Date());
  const userRef = db.doc(`users/${uid}`);
  await userRef.set(
    {
      lastWeeklyYMD: weekStart,   // guardamos a semana (segunda)
      weeklyThisWeek: true,       // já submeteu esta semana
    },
    { merge: true }
  );
}

/**
 * (Opcional) Atualiza nextCheckinYMD ao marcar/alterar check-in.
 */
export async function updateNextCheckin(uid: string, ymd: string | null) {
  const db = getAdminDB();
  await db.doc(`users/${uid}`).set({ nextCheckinYMD: ymd }, { merge: true });
}
