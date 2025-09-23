import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import "firebase-admin/storage";
import "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lazy/Singleton admin init
function initAdmin() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  const rawBucket = (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  const bucketName = rawBucket.replace(/^gs:\/\//, "");
  let credObj: any = null;
  try {
    credObj = JSON.parse(raw);
  } catch {
    try { credObj = JSON.parse(`{${raw}}`); } catch { credObj = null; }
  }
  if (!credObj) {
    admin.initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: bucketName || undefined });
  } else {
    admin.initializeApp({
      credential: admin.credential.cert(credObj),
      storageBucket: bucketName || undefined,
    });
  }
  return admin.app();
}

async function ensureCoachOrSelf(userId: string, targetUid: string): Promise<boolean> {
  try {
    if (userId === targetUid) return true;
    const app = initAdmin();
    const db = app.firestore();
    const snap = await db.collection("users").doc(userId).get();
    const role = (snap.data() as any)?.role;
    return role === "coach" || role === "admin";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const app = initAdmin();
    const auth = app.auth();
    const bucket = app.storage().bucket(`${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`);

    const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });
    const decoded = await auth.verifyIdToken(idToken);

    const form = await req.formData();
    const kind = String(form.get("kind") || "");
    const targetUid = String(form.get("uid") || decoded.uid);
    const file = form.get("file");

    if (!file || typeof (file as any).arrayBuffer !== "function") {
      return NextResponse.json({ error: "missing_file" }, { status: 400 });
    }
    if (kind !== "training" && kind !== "diet") {
      return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
    }

    const ok = await ensureCoachOrSelf(decoded.uid, targetUid);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const blob = file as unknown as File;
    const ct = blob.type || "application/pdf";
    if (ct !== "application/pdf") {
      return NextResponse.json({ error: "only_pdf" }, { status: 400 });
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    if (buf.length > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const path = `plans/${targetUid}/${kind}.pdf`;
    const fileRef = bucket.file(path);
    await fileRef.save(buf, { contentType: ct, resumable: false, public: false, metadata: { cacheControl: "public,max-age=60" } });

    // Generate a signed URL valid for 7 days
    const [url] = await fileRef.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    return NextResponse.json({ path, url });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}
