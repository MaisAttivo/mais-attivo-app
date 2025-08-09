// setCoach.js
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");

// 👉 define aqui o email do utilizador que será coach
const userEmail = "maisattivo.geral@gmail.com";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // projectId vem do próprio ficheiro, mas podes explicitar:
  projectId: serviceAccount.project_id,
});

async function run() {
  try {
    // Busca o utilizador pelo email (evita teres de copiar o UID)
    const user = await admin.auth().getUserByEmail(userEmail);

    await admin.auth().setCustomUserClaims(user.uid, { coach: true });
    console.log(`✅ Claim coach:true atribuído ao utilizador ${user.email} (${user.uid})`);

    console.log("ℹ️ Faz logout/login na app ou força refresh com getIdToken(true).");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro:", err);
    process.exit(1);
  }
}

run();
