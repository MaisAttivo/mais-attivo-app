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

    // Prefer Firestore list, fallback to storage if empty
    const colRef = db.collection("users").doc(targetUid).collection("inbody");
    const snap = await colRef.orderBy("createdAt", "desc").limit(200).get();
    let items: Array<{ url: string; name: string; contentType: string; createdAt?: string | null }> = [];
    if (!snap.empty) {
      items = snap.docs.map(d => {
        const x: any = d.data() || {};
        return { url: x.url, name: x.name || d.id, contentType: x.contentType || "application/octet-stream", createdAt: x.createdAt ? (x.createdAt.toDate ? x.createdAt.toDate().toISOString() : x.createdAt) : null };
      }).filter(x => typeof x.url === 'string');
    } else {
      const primaryName = mapBucketName(process.env.FIREBASE_UPLOAD_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
      const primary = primaryName ? admin.storage().bucket(primaryName) : app.storage().bucket();
      const altName = mapBucketName(process.env.FIREBASE_ALT_BUCKET);
      const alt = altName ? admin.storage().bucket(altName) : null;
      const prefixes = [
        `users/${targetUid}/inbody/`,
        `inbody/${targetUid}/`,
        `users/${targetUid}/InBody/`,
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
      const filtered = Array.from(unique.values()).filter((f: any) => {
        const ct = (f.metadata as any)?.contentType || "";
        const name = (f.name || "").toLowerCase();
        const looksInbody = name.includes("inbody");
        return looksInbody && (ct.startsWith("image/") || ct === "application/pdf");
      });
      items = await Promise.all(filtered.map(async (f: any) => {
        const [url] = await f.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
        const ct = (f.metadata as any)?.contentType || "application/octet-stream";
        return { url, name: f.name.split("/").pop() || f.name, contentType: ct, createdAt: (f.metadata as any)?.timeCreated || null };
      }));
      items.sort((a,b)=> (new Date(b.createdAt||0).getTime()) - (new Date(a.createdAt||0).getTime()));
    }
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const app = initAdmin();
    const auth = app.auth();
    const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });
    const decoded = await auth.verifyIdToken(idToken);

    const form = await req.formData();
    const file = form.get("file");
    const targetUid = String(form.get("uid") || decoded.uid);
    const ok = await ensureCoachOrSelf(decoded.uid, targetUid);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    if (!file || typeof (file as any).arrayBuffer !== "function") {
      return NextResponse.json({ error: "missing_file" }, { status: 400 });
    }
    const blob = file as unknown as File;
    const ct = blob.type || "image/jpeg";
    if (!(ct === "image/jpeg" || ct === "image/png" || ct === "application/pdf")) {
      return NextResponse.json({ error: "only_image_or_pdf" }, { status: 400 });
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    if (buf.length > 30 * 1024 * 1024) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const uploadBucketName = (process.env.FIREBASE_UPLOAD_BUCKET || "").trim().replace(/^gs:\/\//, "");
    const bucket = uploadBucketName ? admin.storage().bucket(uploadBucketName) : app.storage().bucket();
    const db = app.firestore();
    const ts = Date.now();
    const ext = ct === "image/png" ? "png" : ct === "application/pdf" ? "pdf" : "jpg";
    const path = `users/${targetUid}/inbody/${ts}.${ext}`;
    const f = bucket.file(path);
    try {
      await f.save(buf, { contentType: ct, resumable: false, public: false, metadata: { cacheControl: "public,max-age=60" } });
    } catch (err: any) {
      return NextResponse.json({ error: "upload_failed", message: err?.message || String(err) }, { status: 500 });
    }
    const [url] = await f.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    // Write Firestore doc
    await db.collection("users").doc(targetUid).collection("inbody").add({
      url,
      name: `${ts}.${ext}`,
      contentType: ct,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ path, url });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}
