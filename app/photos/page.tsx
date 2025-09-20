"use client";

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, storage, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, listAll, getMetadata, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs } from "firebase/firestore";

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

  // Consentimento de uso de imagens
  const [imgConsent, setImgConsent] = useState<boolean>(false);
  const [imgConsentAt, setImgConsentAt] = useState<Date | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [coachOverride, setCoachOverride] = useState<boolean>(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [mainIndex, setMainIndex] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const [openSet, setOpenSet] = useState<{ id: string; urls: string[] } | null>(null);

  useEffect(() => {
    if (!auth) { setLoading(false); setError("Sessão indisponível. Inicia sessão novamente."); return; }
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setLoading(false); router.replace("/login"); return; }
      setUid(u.uid);
      try {
        if (db) {
          const us = await getDoc(doc(db, "users", u.uid));
          const d: any = us.data() || {};
          setImgConsent(!!d.imageUseConsent);
          const at: any = d.imageUseConsentAt;
          setImgConsentAt(at?.toDate ? at.toDate() : null);
          setCoachOverride(!!d.imageUploadAllowedByCoach);
        }
      } catch {}
      setLoading(false);
      await load(u.uid);
    });
    return () => unsub();
  }, [router]);

  async function load(userId: string) {
    const out: PhotoItem[] = [];
    // 1) Tentar Storage
    try {
      if (storage) {
        const baseRef = ref(storage, `users/${userId}/photos`);
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
        out.push(...arr);
      }
    } catch (e: any) {
      setError(e?.message || "Falha a carregar fotos.");
    }

    // 2) Fallback Firestore (docs com url/urls)
    try {
      if (out.length === 0 && db) {
        const snap = await getDocs(collection(db, `users/${userId}/photos`));
        const tmp: PhotoItem[] = [];
        snap.forEach((d) => {
          const data: any = d.data() || {};
          const urls: string[] = Array.isArray(data.urls)
            ? data.urls.filter((u: any) => typeof u === "string")
            : (typeof data.url === "string" ? [data.url] : []);
          const ts: any = data.createdAt || data.time || data.date || null;
          const createdAt: Date | null = ts?.toDate?.() || (typeof ts === "number" ? new Date(ts) : null);
          const setId = data.setId || d.id;
          urls.forEach((u: string, idx: number) => {
            tmp.push({ path: `firestore/${d.id}/${idx}`, url: u, createdAt, setId, isMain: idx === 0 });
          });
        });
        if (tmp.length > 0) out.push(...tmp);
      }
    } catch {}

    out.sort((a,b)=>((a.createdAt?.getTime()||0)-(b.createdAt?.getTime()||0)));
    setItems(out);
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

  async function blobFromCanvas(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), type, quality);
    });
  }

  async function resizeForUpload(file: File): Promise<{ blob: Blob; ext: "jpg" | "png" }> {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
      });
      const maxSide = 2000; // reduzir dimensão para acelerar upload
      const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * ratio));
      const h = Math.max(1, Math.round(img.naturalHeight * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D não disponível");
      ctx.drawImage(img, 0, 0, w, h);

      // Fotos → preferir JPEG para melhor compressão
      const blob = await blobFromCanvas(canvas, "image/jpeg", 0.9);
      return { blob, ext: "jpg" };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  useEffect(() => {
    return () => {
      previews.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [previews]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uid || !storage) return;
    if (selectedFiles.length === 0) { setError("Seleciona até 4 imagens."); return; }
    if (selectedFiles.length > 4) { setError("Máx. 4 imagens por envio."); return; }
    if (!imgConsent && !coachOverride) { setError("Para enviar fotos, aceita o consentimento de imagens ou pede ao coach autorização."); return; }
    if (alreadyThisWeek) { setError("Já enviaste fotos esta semana. Tenta na próxima semana."); return; }

    setError(null);
    setUploading(true);
    try {
      const w = lisbonISOWeekId();
      const setId = `${w}-${Date.now()}`;

      // Pré-processar imagens (downscale/compress) para uploads mais rápidos
      const processed = await Promise.all(selectedFiles.map(async (file) => {
        const { blob, ext } = await resizeForUpload(file);
        return { blob, ext, type: "image/jpeg" as const };
      }));

      const totalBytes = processed.reduce((sum, p) => sum + p.blob.size, 0);
      const prevBytes = processed.map(() => 0);
      let transferred = 0;

      await Promise.all(processed.map(async (p, idx) => {
        const isMain = idx === mainIndex;
        const name = `${setId}-${idx}${isMain ? "_main" : ""}.${p.ext}`;
        const r = ref(storage, `users/${uid}/photos/${name}`);
        const task = uploadBytesResumable(r, p.blob, { contentType: p.type });
        await new Promise<void>((resolve, reject) => {
          task.on("state_changed", (snap) => {
            const delta = snap.bytesTransferred - prevBytes[idx];
            prevBytes[idx] = snap.bytesTransferred;
            transferred += Math.max(0, delta);
            const pct = totalBytes > 0 ? Math.round((transferred / totalBytes) * 100) : 0;
            setUploadProgress(pct);
          }, reject, () => resolve());
        });
      }));
      setSelectedFiles([]);
      previews.forEach((u) => URL.revokeObjectURL(u));
      setPreviews([]);
      setUploadProgress(0);
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
        <Button asChild variant="ghost" size="sm"><Link href="/dashboard"><ArrowLeft className="h-4 w-4" />Voltar à dashboard</Link></Button>
        <h1 className="text-2xl font-semibold">Fotos</h1>
        <div className="w-10" />
      </div>

      <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <input
            id="image-consent"
            type="checkbox"
            className="mt-1"
            checked={imgConsent}
            onChange={async (e) => {
              const next = e.currentTarget.checked;
              setSavingConsent(true);
              try {
                if (db && uid) {
                  await updateDoc(doc(db, "users", uid), {
                    imageUseConsent: next,
                    imageUseSocialCensored: next,
                    imageUseConsentAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                  setImgConsent(next);
                  setImgConsentAt(new Date());
                }
              } catch (err: any) {
                setError(err?.message || "Falha a atualizar consentimento.");
              } finally {
                setSavingConsent(false);
              }
            }}
          />
          <label htmlFor="image-consent" className="text-sm text-slate-700 leading-relaxed">
            Autorizo a utilização das minhas imagens para acompanhamento e marketing, desde que com o rosto tapado.
            <div className="text-xs text-slate-500 mt-1">{imgConsentAt ? `Última alteração: ${imgConsentAt.toLocaleString()}` : ""}</div>
          </label>
          <div className="flex-1" />
          {savingConsent && <div className="text-xs text-slate-500">A guardar…</div>}
        </div>
      </div>

      <form onSubmit={handleUpload} className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 space-y-3">
        <div className="text-sm text-slate-600">Envia até 4 fotos (1x por semana). Escolhe a principal.</div>
        <div className="flex flex-col items-start gap-2">
          <Input ref={fileRef as any} type="file" accept="image/png,image/jpeg" multiple className="hidden" aria-hidden="true" onChange={(e)=>{
            const files = Array.from(e.currentTarget.files || []).slice(0,4);
            // limpar previews antigos
            previews.forEach((u)=>URL.revokeObjectURL(u));
            const urls = files.map((f)=>URL.createObjectURL(f));
            setPreviews(urls);
            setSelectedFiles(files);
            setMainIndex(0);
          }} />
          <Button size="sm" type="button" onClick={()=>fileRef.current?.click()}>Escolher ficheiros</Button>
          <div className="text-xs text-slate-600 leading-relaxed max-w-full truncate">{selectedFiles.length ? selectedFiles.map(f=>f.name).join(", ") : "Nenhum ficheiro selecionado"}</div>
          {selectedFiles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
              {selectedFiles.map((f, i)=> (
                <label key={i} className="border rounded-xl p-2 flex flex-col items-center gap-2 cursor-pointer">
                  <input type="radio" name="main" className="self-start" checked={mainIndex===i} onChange={()=>setMainIndex(i)} />
                  <img src={previews[i]} alt={f.name} className="h-24 w-24 object-cover rounded-lg" />
                  <div className="text-xs truncate max-w-[160px]">{f.name}</div>
                </label>
              ))}
            </div>
          )}
        </div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <div className="flex items-center justify-between gap-3">
          {uploading && (
            <div className="text-xs text-slate-600">Progresso: {uploadProgress}%</div>
          )}
          <div className="text-xs text-slate-600">
            {!imgConsent && !coachOverride ? "Uploads bloqueados: aceita o consentimento ou pede autorização ao coach." : ""}
          </div>
          <div className="flex-1" />
          <Button type="submit" disabled={uploading || selectedFiles.length===0 || alreadyThisWeek || (!imgConsent && !coachOverride)}>{uploading ? `A enviar… ${uploadProgress}%` : alreadyThisWeek ? "Limitado esta semana" : "Anexar"}</Button>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <div className="text-sm text-slate-700 mb-2">Início</div>
          {firstSet ? (
            <button className="w-full text-left" onClick={()=>setOpenSet({ id: firstSet.id, urls: firstSet.list.map(x=>x.url) })}>
              <div className="relative w-full h-56 bg-slate-100 rounded-xl overflow-hidden">
                <img src={firstSet.main.url} alt="Inicio" className="absolute inset-0 w-full h-full object-contain" />
              </div>
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
              <div className="relative w-full h-56 bg-slate-100 rounded-xl overflow-hidden">
                <img src={lastSet.main.url} alt="Atual" className="absolute inset-0 w-full h-full object-contain" />
              </div>
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
