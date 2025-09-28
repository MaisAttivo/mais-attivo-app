import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb, bucket } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(req: NextRequest) {
  try {
    const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "missing_token" }, { status: 401 });
    const decoded = await getAuth().verifyIdToken(idToken);

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
    const buf = Buffer.from(await (blob as any).arrayBuffer());
    if (buf.length > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    const objectPath = `plans/${targetUid}/${kind}.pdf`;
    const fileRef = bucket.file(objectPath);
    await fileRef.save(buf, {
      contentType: ct,
      resumable: false,
      public: false,
      metadata: { cacheControl: "public,max-age=60" },
    });

    const [url] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return NextResponse.json({ path: objectPath, url, bucket: bucket.name });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
}
