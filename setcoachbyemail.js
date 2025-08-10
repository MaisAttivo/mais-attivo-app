// setCoachByEmail.js
const admin = require("firebase-admin");
const sa = require("./serviceAccount.json");
const EMAIL = "maisattivo.redes@gmail.comnod";

admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });

async function ensureUser(email) {
  try { return await admin.auth().getUserByEmail(email); }
  catch (e) {
    if (e.code === "auth/user-not-found") {
      console.log("ℹ️ Utilizador não existe. A criar…");
      const { uid } = await admin.auth().createUser({ email, password: Math.random().toString(36).slice(2) + "A!" });
      return await admin.auth().getUser(uid);
    }
    throw e;
  }
}

ensureUser(EMAIL)
  .then(u => admin.auth().setCustomUserClaims(u.uid, { coach: true }).then(() =>
    console.log(`✅ coach:true definido para ${u.email} (${u.uid})`)
  ))
  .catch(console.error);
