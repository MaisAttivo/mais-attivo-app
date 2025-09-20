"use client";

"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, storage, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes, listAll, getMetadata, deleteObject } from "firebase/storage";
import { collection, getDocs } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Upload, ArrowLeft } from "lucide-react";

export default function InBodyPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<Array<{ id: string; url: string; createdAt?: Date | null }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; sl: number; st: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

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
    // 1) Tentar Storage
    const items: Array<{ id: string; url: string; createdAt: Date | null }> = [];
    try {
      if (storage) {
        const bucket = (storage as any)?.app?.options?.storageBucket || "";
        const dirRef = ref(storage, bucket ? `gs://${bucket}/users/${userId}/inbody` : `users/${userId}/inbody`);
        const res = await listAll(dirRef);
        const fromStorage = await Promise.all(
          res.items.map(async (it) => {
            const [url, meta] = await Promise.all([getDownloadURL(it), getMetadata(it)]);
            let createdAt: Date | null = meta.timeCreated ? new Date(meta.timeCreated) : null;
            if (!createdAt) {
              const base = it.name.replace(/\.(png|jpg|jpeg)$/i, "");
              const n = Number(base);
              if (Number.isFinite(n) && n > 0) createdAt = new Date(n);
            }
            return { id: it.name, url, createdAt } as { id: string; url: string; createdAt: Date | null };
          })
        );
        items.push(...fromStorage);
      }
    } catch (e: any) {
      setError(e?.message || "Falha a listar ficheiros.");
    }

    // 2) Fallback Firestore (caso existam docs com URLs)
    try {
      if (items.length === 0 && db) {
        const snap = await getDocs(collection(db, `users/${userId}/inbody`));
        const fromFs: Array<{ id: string; url: string; createdAt: Date | null }> = [];
        snap.forEach((d) => {
          const data: any = d.data() || {};
          const url: string | undefined = data.url || data.downloadUrl || data.href;
          if (typeof url === "string" && url) {
            const ts: any = data.createdAt || data.time || data.date || null;
            const createdAt: Date | null = ts?.toDate?.() || (typeof ts === "number" ? new Date(ts) : null);
            fromFs.push({ id: d.id, url, createdAt });
          }
        });
        if (fromFs.length > 0) items.push(...fromFs);
      }
    } catch {}

    items.sort((a, b) => ((b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)) || b.id.localeCompare(a.id));
    setFiles(items);
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!uid) return;
    setError(null);
    setSubmitting(true);

    try {
      const form = e.currentTarget as HTMLFormElement;
      const input = (form.elements.namedItem("inbody") as HTMLInputElement) || null;
      if (!input || !input.files || input.files.length === 0) { setError("Seleciona um ficheiro PNG."); setSubmitting(false); return; }

      const file = input.files[0];
      const allowed = ["image/png", "image/jpeg", "image/jpg"];
      if (!allowed.includes(file.type)) { setError("Apenas PNG ou JPEG são permitidos."); setSubmitting(false); return; }
      if (file.size > 8 * 1024 * 1024) { setError("Máx. 8MB."); setSubmitting(false); return; }

      if (!storage) throw new Error("Storage indisponível. Configura as envs NEXT_PUBLIC_FIREBASE_*");
      const ts = Date.now();
      const ext = (/\.jpe?g$/i.test(file.name) || file.type === "image/jpeg" || file.type === "image/jpg") ? "jpg" : "png";
      const path = `users/${uid}/inbody/${ts}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: file.type || (ext === "jpg" ? "image/jpeg" : "image/png") });
      form.reset();
      setSelectedName(null);
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
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard"><ArrowLeft className="h-4 w-4" />Voltar à dashboard</Link>
        </Button>
      </div>

      <h1 className="text-3xl font-bold mb-2 text-center">InBody</h1>
      <p className="text-center text-sm text-gray-600 mb-6">Anexa aqui as tuas avaliações InBody (PNG).</p>

      <form onSubmit={handleUpload} className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 space-y-3">
        <div className="flex flex-col items-start gap-2">
          <Input ref={fileInputRef as any} type="file" name="inbody" accept="image/png,image/jpeg" aria-label="Carregar InBody (imagem PNG ou JPEG)" className="hidden" aria-hidden="true" onChange={(e)=>{ const f=e.currentTarget.files?.[0]; setSelectedName(f ? f.name : null); }} />
          <Button size="sm" type="button" onClick={()=>fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Escolher ficheiro
          </Button>
          <div className="text-xs text-slate-600 leading-relaxed max-w-full truncate">{selectedName ?? "Nenhum ficheiro selecionado"}</div>
          <p className="text-xs text-slate-500">Apenas PNG ou JPEG, até 8MB.</p>
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
                  <Button size="sm" variant="destructive" aria-label="Eliminar" onClick={() => handleDelete(f.id)} disabled={deletingId === f.id}>
                    <X className="h-4 w-4" />
                  </Button>
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
              <Button size="sm" variant="outline" onClick={() => setZoom((z)=>Math.max(0.5, +(z-0.25).toFixed(2)))}>-</Button>
              <Button size="sm" variant="outline" onClick={() => setZoom((z)=>Math.min(5, +(z+0.25).toFixed(2)))}>+</Button>
              <Button size="sm" variant="outline" onClick={() => setZoom(1)}>Reset</Button>
              <Button size="sm" variant="secondary" onClick={() => { setPreviewUrl(null); setZoom(1); }}>
                Fechar
              </Button>
              <Button size="sm" variant="outline" asChild><a href={previewUrl} download>Download</a></Button>
            </div>
            <div
              ref={containerRef}
              className="w-full h-full overflow-auto bg-black/5 cursor-grab"
              onWheel={(e) => {
                if (e.ctrlKey) {
                  e.preventDefault();
                  setZoom((z)=>{
                    const nz = e.deltaY > 0 ? z - 0.1 : z + 0.1;
                    return Math.min(5, Math.max(0.5, +nz.toFixed(2)));
                  });
                }
              }}
              onMouseDown={(e) => {
                if (!containerRef.current) return;
                setPanning(true);
                setPanStart({ x: e.clientX, y: e.clientY, sl: containerRef.current.scrollLeft, st: containerRef.current.scrollTop });
                (e.currentTarget as HTMLDivElement).style.cursor = "grabbing";
              }}
              onMouseMove={(e) => {
                if (!panning || !panStart || !containerRef.current) return;
                const dx = e.clientX - panStart.x;
                const dy = e.clientY - panStart.y;
                containerRef.current.scrollLeft = panStart.sl - dx;
                containerRef.current.scrollTop = panStart.st - dy;
              }}
              onMouseUp={(e) => {
                setPanning(false);
                (e.currentTarget as HTMLDivElement).style.cursor = "auto";
              }}
              onMouseLeave={(e) => {
                setPanning(false);
                (e.currentTarget as HTMLDivElement).style.cursor = "auto";
              }}
            >
              <div className="min-w-full min-h-full flex items-center justify-center p-4">
                <img
                  src={previewUrl}
                  alt="InBody"
                  onLoad={(ev) => {
                    const img = ev.currentTarget;
                    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
                  }}
                  style={{ width: imgSize ? Math.max(100, Math.round(imgSize.w * zoom)) : undefined }}
                  className="rounded-lg shadow select-none"
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
