// app/api/storage/photos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb, bucket } from "@/lib/firebaseAdmin"; // ← usa o ficheiro admin que te passei

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoWeekId(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const w = String(weekNo).padStart(2, "0");
  return `${date.getUTCFullYear()}-W${w}`;
}

async function ensureCoachOrSelf(userId: string, targetUid: string): Promise<boolean> {
  if (userId === targetUid) return true;
  try {
    const snap = await adminDb.collection("users").doc(userId).get();
    const role = (snap.data() as any)?.role;
    return role === "coach" || role === "admin";
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const authz = req.headers.get("authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });

    const decoded = await getAuth().verifyIdToken(idToken);
    const url = new URL(req.url);
    const targetUid = String(url.searchParams.get("uid") || decoded.uid);
    const ok = await ensureCoachOrSelf(decoded.uid, targetUid);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const ref = adminDb.collection("users").doc(targetUid).collection("photoSets");
    const snap = await ref.orderBy("createdAt", "asc").limit(120).get();
    let sets = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    sets = sets.filter((s: any) => Array.isArray(s.urls) && s.urls.length > 0);

    // Fallback: listar diretamente do bucket se ainda não houver coleção
    let items: Array<{ url: string; name: string; createdAt?: string | null }> = [];
    if (sets.length === 0) {
      const prefixes = [
        `users/${targetUid}/photos/`,
        `fotos/${targetUid}/`,
        `photos/${targetUid}/`,
      ];
      let found: any[] = [];
      for (const p of prefixes) {
        const [files] = await bucket.getFiles({ prefix: p, autoPaginate: false, maxResults: 200 }).catch(() => [ [] ]);
        if (files && files.length) { found = files; break; }
      }
      const unique = new Map<string, any>();
      for (const f of found) unique.set(f.name, f);
      const imgs = Array.from(unique.values()).filter((f: any) =>
        String((f.metadata?.contentType) || "").startsWith("image/")
      );
      items = await Promise.all(
        imgs.map(async (f: any) => {
          const [url] = await f.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 3600 * 1000 });
          const createdAt = f.metadata?.timeCreated || null;
          return { url, name: f.name.split("/").pop() || f.name, createdAt };
        })
      );
      items.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()));
    }

    return NextResponse.json({ sets, items });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authz = req.headers.get("authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });
    const decoded = await getAuth().verifyIdToken(idToken);

    const form = await req.formData();
    const targetUid = String(form.get("uid") || decoded.uid);
    const ok = await ensureCoachOrSelf(decoded.uid, targetUid);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const files = form.getAll("files");
    if (!files?.length) return NextResponse.json({ error: "missing_files" }, { status: 400 });
    if (files.length > 4) return NextResponse.json({ error: "max_4" }, { status: 400 });

    const weekId = String(form.get("weekId") || isoWeekId(new Date()));

    // Limite semanal (uma submissão/semana)
    const setRef = adminDb.collection("users").doc(targetUid).collection("photoSets").doc(weekId);
    const existing = await setRef.get();
    if (existing.exists) {
      const data: any = existing.data() || {};
      const prev: string[] = Array.isArray(data.urls) ? data.urls : [];
      if (prev.length > 0) {
        // confirma se já existem ficheiros com este prefixo no bucket
        const prefix = `users/${targetUid}/photos/${weekId}-`;
        const [f] = await bucket.getFiles({ prefix, autoPaginate: false, maxResults: 1 }).catch(() => [ [] ]);
        if (f && f.length > 0) {
          return NextResponse.json({ error: "weekly_limit" }, { status: 409 });
        } else {
          await setRef.set({ urls: [], coverUrl: null, updatedAt: Date.now() }, { merge: true });
        }
      }
    }

    const uploadedUrls: string[] = [];
    for (const anyFile of files) {
      const file = anyFile as unknown as File;
      if (typeof (file as any).arrayBuffer !== "function") continue;
      const ct = file.type || "image/jpeg";
      if (!(ct === "image/jpeg" || ct === "image/png")) {
        return NextResponse.json({ error: "only_images" }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length > 30 * 1024 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });

      const ext = ct === "image/png" ? "png" : "jpg";
      const objectPath = `users/${targetUid}/photos/${weekId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const fileRef = bucket.file(objectPath);

      await fileRef.save(buf, {
        contentType: ct,
        resumable: false,
        public: false,
        metadata: { cacheControl: "public,max-age=60" },
      });

      const [signed] = await fileRef.getSignedUrl({
        action: "read",
        expires: Date.now() + 7 * 24 * 3600 * 1000,
      });
      uploadedUrls.push(signed);
    }

    const urls = uploadedUrls.slice(0, 4);
    const coverUrl = urls[0] || null;
    await setRef.set(
      {
        urls,
        coverUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ weekId, urls, coverUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authz = req.headers.get("authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });
    const decoded = await getAuth().verifyIdToken(idToken);

    const body = await req.json();
    const targetUid = String(body.uid || decoded.uid);
    const { weekId, coverUrl } = body || {};
    const ok = await ensureCoachOrSelf(decoded.uid, targetUid);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!weekId || !coverUrl) return NextResponse.json({ error: "missing_params" }, { status: 400 });

    const setRef = adminDb.collection("users").doc(targetUid).collection("photoSets").doc(String(weekId));
    const doc = await setRef.get();
    if (!doc.exists) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const data: any = doc.data() || {};
    const urls: string[] = Array.isArray(data.urls) ? data.urls : [];
    if (!urls.includes(String(coverUrl))) return NextResponse.json({ error: "invalid_cover" }, { status: 400 });

    await setRef.update({ coverUrl: String(coverUrl), updatedAt: new Date() });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}
