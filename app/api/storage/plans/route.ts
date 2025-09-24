import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import "firebase-admin/storage";
import "firebase-admin/firestore";
import fs from "fs";
import os from "os";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lazy/Singleton admin init
function initAdmin() {
  if (admin.apps.length) return admin.app();
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  const rawBucket = (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  const bucketName = rawBucket.replace(/^gs:\/\//, "");
  let credObj: any = null;
  if (raw) {
    let text = raw;
    if (!text.startsWith("{")) text = `{${text}}`;
    try { credObj = JSON.parse(text); } catch { credObj = null; }
    if (credObj && typeof credObj.private_key === 'string') {
      credObj.private_key = credObj.private_key.replace(/\\n/g, "\n");
    }
  }
  if (!credObj) throw new Error('missing_service_account');
  try {
    const p = path.join(os.tmpdir(), `gcp-key-${process.pid}.json`);
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      fs.writeFileSync(p, JSON.stringify(credObj), { encoding: 'utf8' });
      process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
    }
  } catch {}
  admin.initializeApp({
    credential: admin.credential.cert(credObj),
    storageBucket: bucketName || undefined,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
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
    const envPrimary = (process.env.FIREBASE_UPLOAD_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim().replace(/^gs:\/\//, "");
    const envAlt = (process.env.FIREBASE_ALT_BUCKET || "").trim().replace(/^gs:\/\//, "");
    const candidates = [envPrimary, envAlt].filter(Boolean);
    if (candidates.length === 0) return NextResponse.json({ error: 'no_bucket_configured' }, { status: 500 });

    async function saveToFirstAvailable(buf: Buffer, contentType: string, path: string): Promise<{ url: string; used: string }>{
      let lastErr: any = null;
      for (const name of candidates) {
        try {
          const b = app.storage().bucket(name || undefined);
          const f = b.file(path);
          await f.save(buf, { contentType, resumable: false, public: false, metadata: { cacheControl: "public,max-age=60" } });
          const [url] = await f.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
          return { url, used: name || "default" };
        } catch (e: any) {
          lastErr = e;
          continue;
        }
      }
      throw lastErr || new Error("no_bucket_available");
    }

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
    const { url, used } = await saveToFirstAvailable(buf, ct, path);
    return NextResponse.json({ path, url, bucket: used });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}
