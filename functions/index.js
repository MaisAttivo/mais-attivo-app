// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

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
