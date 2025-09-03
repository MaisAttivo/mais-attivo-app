"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function InBodyPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<Array<{ id: string; url: string; createdAt?: Date | null }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.replace("/login"); return; }
      setUid(u.uid);
      setLoading(false);
      await loadFiles(u.uid);
    });
    return () => unsub();
  }, [router]);

  async function loadFiles(userId: string) {
    const q = query(collection(db, `users/${userId}/inbody`), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const list: Array<{ id: string; url: string; createdAt?: Date | null }> = [];
    snap.forEach((d) => {
      const data: any = d.data();
      const createdAt: Date | null = data.createdAt?.toDate?.() ?? null;
      if (typeof data.url === "string") list.push({ id: d.id, url: data.url, createdAt });
    });
    setFiles(list);
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!uid) return;
    setError(null);
    setSubmitting(true);

    try {
      const input = (e.currentTarget.elements.namedItem("inbody") as HTMLInputElement) || null;
      if (!input || !input.files || input.files.length === 0) { setError("Seleciona um ficheiro PNG."); setSubmitting(false); return; }

      const file = input.files[0];
      if (file.type !== "image/png") { setError("Apenas PNG é permitido."); setSubmitting(false); return; }
      if (file.size > 8 * 1024 * 1024) { setError("Máx. 8MB."); setSubmitting(false); return; }

      const ts = Date.now();
      const path = `users/${uid}/inbody/${ts}.png`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: "image/png" });
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, `users/${uid}/inbody`), {
        url,
        storagePath: path,
        fileName: file.name,
        size: file.size,
        createdAt: serverTimestamp(),
      });

      (e.currentTarget as HTMLFormElement).reset();
      await loadFiles(uid);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Falha ao carregar o ficheiro.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-6">A carregar…</div>;

  return (
    <main className="relative max-w-xl mx-auto p-6 pb-24">
      <div className="mb-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <span>⬅️</span> Voltar à dashboard
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2 text-center">InBody</h1>
      <p className="text-center text-sm text-gray-600 mb-6">Anexa aqui as tuas avaliações InBody (PNG).</p>

      <form onSubmit={handleUpload} className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 space-y-3">
        <div>
          <Input type="file" name="inbody" accept="image/png" aria-label="Carregar InBody (PNG)" />
          <p className="text-xs text-slate-500 mt-1">Apenas PNG, até 8MB.</p>
        </div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>{submitting ? "A enviar…" : "Anexar"}</Button>
        </div>
      </form>

      <div className="mt-6 grid grid-cols-1 gap-4">
        {files.length === 0 ? (
          <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 text-center text-sm text-slate-600">Sem anexos ainda.</div>
        ) : (
          files.map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 block hover:bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">InBody</div>
                  <div className="text-xs text-slate-500">{f.createdAt ? f.createdAt.toLocaleString() : "—"}</div>
                </div>
                <div className="text-sm text-slate-600">Abrir</div>
              </div>
            </a>
          ))
        )}
      </div>
    </main>
  );
}
