import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import "firebase-admin/storage";
import "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  const projectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  let credObj: any = null;
  if (raw) {
    let text = raw;
    if (!text.startsWith("{")) text = `{${text}}`;
    try { credObj = JSON.parse(text); } catch { credObj = null; }
    if (credObj && typeof credObj.private_key === 'string') {
      credObj.private_key = credObj.private_key.replace(/\\n/g, "\n");
    }
  }
  const initOpts: any = {};
  if (projectId) initOpts.projectId = projectId;
  if (credObj) initOpts.credential = admin.credential.cert(credObj);
  admin.initializeApp(initOpts);
  return admin.app();
}

function mapBucketName(name?: string) {
  const n = (name || "").trim().replace(/^gs:\/\//, "");
  if (!n) return "";
  return n.endsWith('.firebasestorage.app') ? n.replace('.firebasestorage.app', '.appspot.com') : n;
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
    let sets = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    let items: Array<{ url: string; name: string; createdAt?: string | null }> = [];
    if (sets.length > 0) {
      for (const s of sets) {
        const arr: string[] = Array.isArray(s.urls) ? s.urls : [];
        const created = s.createdAt ? (s.createdAt.toDate ? s.createdAt.toDate().toISOString() : s.createdAt) : null;
        for (const u of arr) items.push({ url: u, name: s.id, createdAt: created });
      }
    } else {
      // Fallback to storage listing across configured buckets
      const primaryName = mapBucketName(process.env.FIREBASE_UPLOAD_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
      const primary = primaryName ? admin.storage().bucket(primaryName) : app.storage().bucket();
      const altName = mapBucketName(process.env.FIREBASE_ALT_BUCKET);
      const alt = altName ? admin.storage().bucket(altName) : null;
      const prefixes = [
        `users/${targetUid}/photos/`,
        `users/${targetUid}/fotos/`,
        `fotos/${targetUid}/`,
        `photos/${targetUid}/`,
        `users/${targetUid}/`
      ];
      let collected: any[] = [];
      const buckets = [primary, ...(alt ? [alt] : [])];
      for (const b of buckets) {
        for (const p of prefixes) {
          const [files] = await b.getFiles({ prefix: p, autoPaginate: false, maxResults: 200 }).catch(()=>[[]]);
          collected = collected.concat(files as any);
          if (collected.length >= 1 && p !== `users/${targetUid}/`) break;
        }
        if (collected.length > 0) break;
      }
      const unique = new Map<string, any>();
      for (const f of collected) unique.set(f.name, f);
      const all = Array.from(unique.values()).filter((f: any) => {
        const ct = (f.metadata as any)?.contentType || "";
        return ct.startsWith("image/");
      });
      items = await Promise.all(all.map(async (f: any) => {
        const [url] = await f.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
        const createdAt = (f.metadata as any)?.timeCreated || null;
        return { url, name: f.name.split('/').pop() || f.name, createdAt };
      }));
      items.sort((a,b)=> (new Date(a.createdAt||0).getTime()) - (new Date(b.createdAt||0).getTime()));
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
    const uploadBucketName = mapBucketName(process.env.FIREBASE_UPLOAD_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const bucket = uploadBucketName ? admin.storage().bucket(uploadBucketName) : app.storage().bucket();
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
      if (buf.length > 30 * 1024 * 1024) return NextResponse.json({ error: 'too_large' }, { status: 413 });
      const ext = ct === 'image/png' ? 'png' : 'jpg';
      const path = `users/${targetUid}/photos/${weekId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const f = bucket.file(path);
      try {
        await f.save(buf, { contentType: ct, resumable: false, public: false, metadata: { cacheControl: 'public,max-age=60' } });
      } catch (err: any) {
        return NextResponse.json({ error: 'upload_failed', message: err?.message || String(err) }, { status: 500 });
      }
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
