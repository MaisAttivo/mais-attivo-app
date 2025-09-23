import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import "firebase-admin/storage";
import "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  const rawBucket = (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  const bucketName = rawBucket.replace(/^gs:\/\//, "");
  let credObj: any = null;
  try { credObj = JSON.parse(raw); } catch { try { credObj = JSON.parse(`{${raw}}`); } catch { credObj = null; } }
  if (!credObj) {
    admin.initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: bucketName || undefined });
  } else {
    admin.initializeApp({ credential: admin.credential.cert(credObj), storageBucket: bucketName || undefined });
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
  } catch { return false; }
}

function isoWeekId(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const w = String(weekNo).padStart(2, '0');
  return `${date.getUTCFullYear()}-W${w}`;
}

export async function GET(req: NextRequest) {
  try {
    const app = initAdmin();
    const auth = app.auth();
    const db = app.firestore();
    const url = new URL(req.url);
    const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });
    const decoded = await auth.verifyIdToken(idToken);
    const targetUid = String(url.searchParams.get("uid") || decoded.uid);
    const ok = await ensureCoachOrSelf(decoded.uid, targetUid);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const ref = db.collection("users").doc(targetUid).collection("photoSets");
    const snap = await ref.orderBy("createdAt","asc").limit(120).get();
    const sets = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // Flatten items for backward compatibility
    const items: Array<{ url: string; name: string; createdAt?: string | null }> = [];
    for (const s of sets) {
      const arr: string[] = Array.isArray(s.urls) ? s.urls : [];
      for (const u of arr) items.push({ url: u, name: s.id, createdAt: s.createdAt ? (s.createdAt.toDate ? s.createdAt.toDate().toISOString() : s.createdAt) : null });
    }
    return NextResponse.json({ sets, items });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const app = initAdmin();
    const auth = app.auth();
    const db = app.firestore();
    const bucket = app.storage().bucket();
    const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });
    const decoded = await auth.verifyIdToken(idToken);

    const form = await req.formData();
    const targetUid = String(form.get("uid") || decoded.uid);
    const ok = await ensureCoachOrSelf(decoded.uid, targetUid);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const files = form.getAll("files");
    if (!files || files.length === 0) return NextResponse.json({ error: "missing_files" }, { status: 400 });
    if (files.length > 4) return NextResponse.json({ error: "max_4" }, { status: 400 });

    const weekId = String(form.get("weekId") || isoWeekId(new Date()));
    const uploadedUrls: string[] = [];

    for (const anyFile of files) {
      const file = anyFile as unknown as File;
      if (typeof (file as any).arrayBuffer !== 'function') continue;
      const ct = file.type || "image/jpeg";
      if (!(ct === 'image/jpeg' || ct === 'image/png')) return NextResponse.json({ error: 'only_images' }, { status: 400 });
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) return NextResponse.json({ error: 'too_large' }, { status: 413 });
      const ext = ct === 'image/png' ? 'png' : 'jpg';
      const path = `users/${targetUid}/photos/${weekId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const f = bucket.file(path);
      await f.save(buf, { contentType: ct, resumable: false, public: false, metadata: { cacheControl: 'public,max-age=60' } });
      const [url] = await f.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      uploadedUrls.push(url);
    }

    const setRef = db.collection('users').doc(targetUid).collection('photoSets').doc(weekId);
    const doc = await setRef.get();
    let urls: string[] = uploadedUrls.slice(0,4);
    let coverUrl: string | null = uploadedUrls[0] || null;
    if (doc.exists) {
      const data: any = doc.data() || {};
      const prev: string[] = Array.isArray(data.urls) ? data.urls : [];
      urls = [...prev, ...uploadedUrls].slice(0,4);
      coverUrl = (data.coverUrl && urls.includes(data.coverUrl)) ? data.coverUrl : (coverUrl || urls[0] || null);
    }

    await setRef.set({
      urls,
      coverUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ weekId, urls, coverUrl });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const app = initAdmin();
    const auth = app.auth();
    const db = app.firestore();
    const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });
    const decoded = await auth.verifyIdToken(idToken);

    const body = await req.json();
    const targetUid = String(body.uid || decoded.uid);
    const { weekId, coverUrl } = body || {};
    const ok = await ensureCoachOrSelf(decoded.uid, targetUid);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    if (!weekId || !coverUrl) return NextResponse.json({ error: "missing_params" }, { status: 400 });

    const setRef = db.collection('users').doc(targetUid).collection('photoSets').doc(String(weekId));
    const doc = await setRef.get();
    if (!doc.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const data: any = doc.data() || {};
    const urls: string[] = Array.isArray(data.urls) ? data.urls : [];
    if (!urls.includes(String(coverUrl))) return NextResponse.json({ error: 'invalid_cover' }, { status: 400 });
    await setRef.update({ coverUrl: String(coverUrl), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}
