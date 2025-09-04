"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, storage } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, listAll, getMetadata, getDownloadURL, uploadBytes } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function lisbonISOWeekId(d = new Date()) {
  const dt = new Date(d);
  // Normaliza para meia-noite em Lisboa
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(dt).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as any);
  const iso = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+00:00`);
  const day = (iso.getUTCDay() || 7);
  const thursday = new Date(iso);
  thursday.setUTCDate(thursday.getUTCDate() + (4 - day));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+thursday - +yearStart) / 86400000 + (yearStart.getUTCDay() || 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

type PhotoItem = { path: string; url: string; createdAt: Date | null; setId: string; isMain: boolean };

export default function PhotosPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [mainIndex, setMainIndex] = useState<number>(0);
  const [uploading, setUploading] = useState(false);

  const [openSet, setOpenSet] = useState<{ id: string; urls: string[] } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.replace("/login"); return; }
      setUid(u.uid);
      await load(u.uid);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  async function load(userId: string) {
    if (!storage) { setError("Storage indisponível."); return; }
    const baseRef = ref(storage, `users/${userId}/photos`);
    try {
      const res = await listAll(baseRef);
      const arr: PhotoItem[] = await Promise.all(res.items.map(async (it) => {
        const [meta, url] = await Promise.all([getMetadata(it), getDownloadURL(it)]);
        const createdAt = meta.timeCreated ? new Date(meta.timeCreated) : null;
        const name = it.name; // ex: 2025-W36-1693839300000-0_main.jpg
        const m = name.match(/^([0-9]{4}-W[0-9]{2}-[0-9]{6,})-\d+(_main)?\.(png|jpe?g)$/i);
        const setId = m ? m[1] : name.split("-").slice(0,3).join("-");
        const isMain = /_main\./i.test(name);
        return { path: `users/${userId}/photos/${name}`, url, createdAt, setId, isMain };
      }));
      arr.sort((a,b)=>((a.createdAt?.getTime()||0)-(b.createdAt?.getTime()||0)));
      setItems(arr);
    } catch (e: any) {
      setError(e?.message || "Falha a carregar fotos.");
      setItems([]);
    }
  }

  const sets = useMemo(() => {
    const map = new Map<string, PhotoItem[]>();
    for (const it of items) {
      const list = map.get(it.setId) || [];
      list.push(it);
      map.set(it.setId, list);
    }
    const arr = Array.from(map.entries()).map(([id, list]) => {
      list.sort((a,b)=> a.url.localeCompare(b.url));
      const main = list.find(x=>x.isMain) || list[0];
      const createdAt = list[0]?.createdAt || null;
      return { id, list, main, createdAt } as { id: string; list: PhotoItem[]; main: PhotoItem; createdAt: Date | null };
    });
    arr.sort((a,b)=> (a.createdAt?.getTime()||0) - (b.createdAt?.getTime()||0));
    return arr;
  }, [items]);

  const firstSet = sets[0];
  const lastSet = sets[sets.length-1];

  const alreadyThisWeek = useMemo(()=>{
    const w = lisbonISOWeekId();
    return sets.some(s=> s.id.startsWith(w+"-"));
  }, [sets]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uid || !storage) return;
    if (selectedFiles.length === 0) { setError("Seleciona até 4 imagens."); return; }
    if (selectedFiles.length > 4) { setError("Máx. 4 imagens por envio."); return; }
    if (alreadyThisWeek) { setError("Já enviaste fotos esta semana. Tenta na próxima semana."); return; }

    setError(null);
    setUploading(true);
    try {
      const w = lisbonISOWeekId();
      const setId = `${w}-${Date.now()}`;
      const tasks = selectedFiles.map(async (file, idx) => {
        const ext = (/\.jpe?g$/i.test(file.name) || file.type === "image/jpeg") ? "jpg" : "png";
        const isMain = idx === mainIndex;
        const name = `${setId}-${idx}${isMain ? "_main" : ""}.${ext}`;
        const r = ref(storage, `users/${uid}/photos/${name}`);
        await uploadBytes(r, file, { contentType: file.type || (ext === "jpg" ? "image/jpeg" : "image/png") });
      });
      await Promise.all(tasks);
      setSelectedFiles([]);
      setMainIndex(0);
      if (fileRef.current) fileRef.current.value = "";
      await load(uid);
    } catch (e: any) {
      setError(e?.message || "Falha ao enviar fotos.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <main className="max-w-5xl mx-auto p-6">A carregar…</main>;
  if (!uid) return <main className="max-w-5xl mx-auto p-6">Inicia sessão.</main>;

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm underline">← Voltar</Link>
        <h1 className="text-2xl font-semibold">Fotos</h1>
        <div className="w-10" />
      </div>

      <form onSubmit={handleUpload} className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 space-y-3">
        <div className="text-sm text-slate-600">Envia até 4 fotos (1x por semana). Escolhe a principal.</div>
        <div className="flex flex-col items-start gap-2">
          <Input ref={fileRef as any} type="file" accept="image/png,image/jpeg" multiple onChange={(e)=>{
            const files = Array.from(e.currentTarget.files || []).slice(0,4);
            setSelectedFiles(files);
            setMainIndex(0);
          }} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
            {selectedFiles.map((f, i)=> (
              <label key={i} className="border rounded-xl p-2 flex flex-col items-center gap-2 cursor-pointer">
                <input type="radio" name="main" className="self-start" checked={mainIndex===i} onChange={()=>setMainIndex(i)} />
                <div className="text-xs truncate max-w-[160px]">{f.name}</div>
              </label>
            ))}
          </div>
        </div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <div className="flex justify-end">
          <Button type="submit" disabled={uploading || selectedFiles.length===0 || alreadyThisWeek}>{uploading ? "A enviar…" : alreadyThisWeek ? "Limitado esta semana" : "Anexar"}</Button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <div className="text-sm text-slate-700 mb-2">Início</div>
          {firstSet ? (
            <button className="w-full text-left" onClick={()=>setOpenSet({ id: firstSet.id, urls: firstSet.list.map(x=>x.url) })}>
              <img src={firstSet.main.url} alt="Inicio" className="w-full rounded-xl object-cover" />
              <div className="text-xs text-slate-500 mt-1">{firstSet.createdAt?.toLocaleString() ?? "—"}</div>
            </button>
          ) : (
            <div className="text-sm text-slate-500">Sem fotos.</div>
          )}
        </div>
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <div className="text-sm text-slate-700 mb-2">Atual</div>
          {lastSet ? (
            <button className="w-full text-left" onClick={()=>setOpenSet({ id: lastSet.id, urls: lastSet.list.map(x=>x.url) })}>
              <img src={lastSet.main.url} alt="Atual" className="w-full rounded-xl object-cover" />
              <div className="text-xs text-slate-500 mt-1">{lastSet.createdAt?.toLocaleString() ?? "—"}</div>
            </button>
          ) : (
            <div className="text-sm text-slate-500">Sem fotos.</div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {sets.slice(0, sets.length).map((s) => (
          <div key={s.id} className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-4">
            <div className="text-sm font-medium mb-2">{s.createdAt?.toLocaleString() ?? s.id}</div>
            <div className="flex gap-2 overflow-x-auto">
              {s.list.map((ph, idx)=> (
                <button key={idx} onClick={()=>setOpenSet({ id: s.id, urls: s.list.map(x=>x.url) })} className="shrink-0">
                  <img src={ph.url} alt="Foto" className="h-24 w-24 object-cover rounded-lg" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {openSet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col">
          <div className="relative m-4 md:m-10 bg-white rounded-xl shadow-xl overflow-auto p-4">
            <div className="sticky top-2 right-2 flex justify-end">
              <Button size="sm" variant="secondary" onClick={()=>setOpenSet(null)}>Fechar</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {openSet.urls.map((u, i)=> (
                <img key={i} src={u} alt={`Foto ${i+1}`} className="w-full rounded-xl object-contain" />
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
