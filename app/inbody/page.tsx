"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, storage } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes, listAll, getMetadata, deleteObject } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export default function InBodyPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<Array<{ id: string; url: string; createdAt?: Date | null }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    if (!storage) { setError("Storage indisponível. Configura as envs NEXT_PUBLIC_FIREBASE_*"); return; }
    const dirRef = ref(storage, `users/${userId}/inbody`);
    try {
      const res = await listAll(dirRef);
      const items = await Promise.all(
        res.items.map(async (it) => {
          const [url, meta] = await Promise.all([getDownloadURL(it), getMetadata(it)]);
          let createdAt: Date | null = meta.timeCreated ? new Date(meta.timeCreated) : null;
          if (!createdAt) {
            const base = it.name.replace(/\.png$/i, "");
            const n = Number(base);
            if (Number.isFinite(n) && n > 0) createdAt = new Date(n);
          }
          return { id: it.name, url, createdAt } as { id: string; url: string; createdAt: Date | null };
        })
      );
      // sort desc by createdAt or name
      items.sort((a, b) => ((b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)) || (b.id.localeCompare(a.id)));
      setFiles(items);
    } catch (e: any) {
      setError(e?.message || "Falha a listar ficheiros.");
      setFiles([]);
    }
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

      if (!storage) throw new Error("Storage indisponível. Configura as envs NEXT_PUBLIC_FIREBASE_*");
      const ts = Date.now();
      const path = `users/${uid}/inbody/${ts}.png`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: "image/png" });
      (e.currentTarget as HTMLFormElement).reset();
      await loadFiles(uid);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Falha ao carregar o ficheiro.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(fileId: string) {
    if (!uid) return;
    if (!storage) { setError("Storage indisponível. Configura as envs NEXT_PUBLIC_FIREBASE_*"); return; }
    const ok = window.confirm("Eliminar este ficheiro InBody?");
    if (!ok) return;
    setDeletingId(fileId);
    try {
      const r = ref(storage, `users/${uid}/inbody/${fileId}`);
      await deleteObject(r);
      await loadFiles(uid);
    } catch (e: any) {
      setError(e?.message || "Falha ao eliminar ficheiro.");
    } finally {
      setDeletingId(null);
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
            <div key={f.id} className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 hover:bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">InBody</div>
                  <div className="text-xs text-slate-500 truncate">{f.createdAt ? f.createdAt.toLocaleString() : "—"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setPreviewUrl(f.url)}>Ver</Button>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-600 underline">Abrir</a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col">
          <div className="relative m-4 md:m-10 bg-white rounded-xl shadow-xl flex-1 overflow-hidden">
            <div className="absolute top-3 right-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPreviewUrl(null)}>Fechar</Button>
              <Button size="sm" variant="outline" asChild><a href={previewUrl} download>Download</a></Button>
            </div>
            <div className="w-full h-full overflow-auto bg-black/5 flex items-center justify-center p-4">
              <img src={previewUrl} alt="InBody" className="max-w-full max-h-full rounded-lg shadow" />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
