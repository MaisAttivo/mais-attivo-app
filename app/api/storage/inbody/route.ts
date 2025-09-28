import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, bucket } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureCoachOrSelf(userId: string, targetUid: string): Promise<boolean> {
  if (userId === targetUid) return true;
  try {
    const snap = await adminDb.collection("users").doc(userId).get();
    const role = (snap.data() as any)?.role;
    return role === "coach" || role === "admin";
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });
    const decoded = await getAuth().verifyIdToken(idToken);
    const targetUid = String(url.searchParams.get("uid") || decoded.uid);
    const ok = await ensureCoachOrSelf(decoded.uid, targetUid);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const colRef = adminDb.collection("users").doc(targetUid).collection("inbody");
    const snap = await colRef.orderBy("createdAt", "desc").limit(200).get();
    let items: Array<{ url: string; name: string; contentType: string; createdAt?: string | null }> = [];
    if (!snap.empty) {
      items = snap.docs.map((d) => {
        const x: any = d.data() || {};
        const created = x.createdAt ? (x.createdAt.toDate ? x.createdAt.toDate().toISOString() : x.createdAt) : null;
        return { url: x.url, name: x.name || d.id, contentType: x.contentType || "application/octet-stream", createdAt: created };
      }).filter((x) => typeof x.url === "string");
    } else {
      const prefixes = [
        `users/${targetUid}/inbody/`,
        `inbody/${targetUid}/`,
        `users/${targetUid}/InBody/`,
        `users/${targetUid}/`,
      ];
      let found: any[] = [];
      for (const p of prefixes) {
        const [files] = await bucket.getFiles({ prefix: p, autoPaginate: false, maxResults: 200 }).catch(() => [ [] ]);
        if (files && files.length) {
          found = files as any[];
          if (p !== `users/${targetUid}/`) break;
        }
      }
      const unique = new Map<string, any>();
      for (const f of found) unique.set(f.name, f);
      const filtered = Array.from(unique.values()).filter((f: any) => {
        const ct = (f.metadata as any)?.contentType || "";
        const name = (f.name || "").toLowerCase();
        const looksInbody = name.includes("inbody");
        return looksInbody && (ct.startsWith("image/") || ct === "application/pdf");
      });
      items = await Promise.all(
        filtered.map(async (f: any) => {
          const [url] = await f.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
          const ct = (f.metadata as any)?.contentType || "application/octet-stream";
          return { url, name: f.name.split("/").pop() || f.name, contentType: ct, createdAt: (f.metadata as any)?.timeCreated || null };
        })
      );
      items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });
    const decoded = await getAuth().verifyIdToken(idToken);

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
    const buf = Buffer.from(await (blob as any).arrayBuffer());
    if (buf.length > 30 * 1024 * 1024) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const ts = Date.now();
    const ext = ct === "image/png" ? "png" : ct === "application/pdf" ? "pdf" : "jpg";
    const objectPath = `users/${targetUid}/inbody/${ts}.${ext}`;
    const f = bucket.file(objectPath);

    await f.save(buf, { contentType: ct, resumable: false, public: false, metadata: { cacheControl: "public,max-age=60" } });
    const [url] = await f.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    await adminDb.collection("users").doc(targetUid).collection("inbody").add({
      url,
      name: `${ts}.${ext}`,
      contentType: ct,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ path: objectPath, url });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}
