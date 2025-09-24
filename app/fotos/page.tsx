"use client";

import { useEffect, useRef, useState } from "react";
import { ClientGuard } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FotosPage() {
  return (
    <ClientGuard>
      <FotosContent />
    </ClientGuard>
  );
}

function FotosContent() {
  const [sets, setSets] = useState<Array<{ id: string; urls: string[]; coverUrl?: string; createdAt?: string | null }>>([]);
  const [items, setItems] = useState<Array<{ url: string; name: string; createdAt?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function fetchList() {
    setLoading(true);
    try {
      const { getAuth, onAuthStateChanged } = await import("firebase/auth");
      const a = getAuth();
      const u = a.currentUser || await new Promise<any>((resolve) => onAuthStateChanged(a, (usr) => resolve(usr), () => resolve(null), { onlyOnce: true } as any));
      const token = u ? await u.getIdToken() : "";
      const res = await fetch("/api/storage/photos", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) {
        let msg = `Erro ${res.status}`;
        try { const t = await res.text(); const j = JSON.parse(t); if (j?.message) msg = j.message; } catch {}
        setErrorMsg(msg);
        throw new Error(msg);
      }
      const data = await res.json();
      setSets(Array.isArray(data.sets) ? data.sets : []);
      setItems(Array.isArray(data.items) ? data.items : []);
      setErrorMsg(null);
    } catch (e: any) {
      setSets([]);
      setItems([]);
      if (!errorMsg) setErrorMsg(e?.message || 'Falha a carregar fotos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchList(); }, []);

  // Compress image on the client to avoid 413 (proxy payload limits)
  async function compressImage(file: File): Promise<File> {
    const TARGET_MAX = 2.5 * 1024 * 1024; // ~2.5MB to avoid proxy limits
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

    const loadBitmap = async (): Promise<any> => {
      if ('createImageBitmap' in window) {
        try { return await createImageBitmap(file); } catch {}
      }
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    };

    const src = await loadBitmap();
    let w = (src as any).width;
    let h = (src as any).height;
    let maxSide = 1600;
    let quality = type === 'image/png' ? undefined : 0.82 as number | undefined;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    const nameBase = file.name.replace(/\.[^.]+$/, '');
    const ext = type === 'image/png' ? 'png' : 'jpg';

    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, maxSide / Math.max(w || 1, h || 1));
      const outW = Math.max(1, Math.round((w || 1) * scale));
      const outH = Math.max(1, Math.round((h || 1) * scale));
      canvas.width = outW; canvas.height = outH;
      // @ts-ignore drawImage accepts ImageBitmap or HTMLImageElement
      ctx.drawImage(src as any, 0, 0, outW, outH);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
      if (blob && blob.size < Math.min(file.size, TARGET_MAX)) {
        return new File([blob], `${nameBase}.${ext}`, { type });
      }
      // tighten constraints
      maxSide = Math.floor(maxSide * 0.8);
      if (quality && quality > 0.6) quality = +(quality - 0.08).toFixed(2);
    }

    // Fallback to original if not smaller
    return file;
  }

  async function upload(files: FileList) {
    const arr = Array.from(files).slice(0, 4);
    if (arr.length === 0) return;
    setUploading(true);
    setProgressPct(0);
    try {
      setErrorMsg(null);
      const { getAuth, onAuthStateChanged } = await import("firebase/auth");
      const a = getAuth();
      const u = a.currentUser || await new Promise<any>((resolve) => onAuthStateChanged(a, (usr) => resolve(usr), () => resolve(null), { onlyOnce: true } as any));
      const token = u ? await u.getIdToken() : "";

      for (const original of arr) {
        const file = await compressImage(original);
        const fd = new FormData();
        fd.append("files", file);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/storage/photos");
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / Math.max(1, e.total || file.size)) * 100);
            setProgressPct(Math.min(95, pct));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setProgressPct(95);
              resolve();
            } else {
              let msg = `Erro ${xhr.status}`;
              try { const j = JSON.parse(xhr.responseText); if (j?.message) msg = j.message; } catch {}
              setErrorMsg(msg);
              reject(new Error(msg));
            }
          };
          xhr.onerror = () => reject(new Error("network_error"));
          xhr.send(fd);
        }).catch((err) => { throw err; });
      }

      setProgressPct(100);
      await fetchList();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Falha no envio');
    } finally {
      setUploading(false);
      setProgressPct(null);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (uploading) return;
    const fs = e.dataTransfer.files;
    if (fs && fs.length > 0) upload(fs);
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Fotos de Progresso</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`rounded-2xl border border-dashed p-6 sm:p-8 bg-muted/50 flex flex-col items-center justify-center gap-3 text-center transition-colors ${dragOver ? "border-blue-600 bg-muted" : ""}`}
            onDragOver={(e)=>{ e.preventDefault(); setDragOver(true); }}
            onDragLeave={()=>setDragOver(false)}
            onDrop={onDrop}
          >
            <div className="text-sm text-muted-foreground">Arrasta as tuas fotos para aqui ou</div>
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg"
                multiple
                className="hidden"
                onChange={(e)=>{ const fs=e.currentTarget.files; if (fs && fs.length>0) { upload(fs); e.currentTarget.value = ""; } }}
              />
              <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? "A enviar…" : "Carregar até 4 fotos"}
              </Button>
            </div>
            {typeof progressPct === "number" && (
              <div className="w-full max-w-xs flex items-center gap-2 mt-2">
                <div className="w-full h-2 rounded bg-slate-200 overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="text-xs text-slate-600 min-w-8 text-right">{progressPct}%</span>
              </div>
            )}
            {errorMsg && (
              <div className="w-full max-w-md text-left text-xs text-red-600">{errorMsg}</div>
            )}
            <div className="text-xs text-muted-foreground">Formatos suportados: JPG, PNG. Máx. 4 por envio.</div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Destaques</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">A carregar…</div>
          ) : (sets.length === 0 && items.length === 0) ? (
            <div className="text-sm text-muted-foreground">Sem fotos.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-slate-700 mb-2">Inicio</div>
                <button className="w-full text-left" onClick={()=>{
                  const u = sets.length ? (sets[0].coverUrl || sets[0].urls[0]) : (items.length ? items[0].url : "");
                  if (u) setPreview(u);
                }}>
                  <div className="relative w-full h-56 bg-muted rounded-xl overflow-hidden">
                    <img src={sets.length ? (sets[0].coverUrl || sets[0].urls[0]) : (items[0]?.url || "")} alt="Inicio" className="absolute inset-0 w-full h-full object-contain" />
                  </div>
                </button>
              </div>
              <div>
                <div className="text-sm text-slate-700 mb-2">Atual</div>
                <button className="w-full text-left" onClick={()=>{
                  const u = sets.length ? (sets[sets.length-1].coverUrl || sets[sets.length-1].urls[0]) : (items.length ? items[items.length-1].url : "");
                  if (u) setPreview(u);
                }}>
                  <div className="relative w-full h-56 bg-muted rounded-xl overflow-hidden">
                    <img src={sets.length ? (sets[sets.length-1].coverUrl || sets[sets.length-1].urls[0]) : (items[items.length-1]?.url || "")} alt="Atual" className="absolute inset-0 w-full h-full object-contain" />
                  </div>
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Todos os updates</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">A carregar…</div>
          ) : (sets.length === 0 && items.length === 0) ? (
            <div className="text-sm text-muted-foreground">Sem fotos.</div>
          ) : sets.length > 0 ? (
            <div className="space-y-3">
              {sets.map((s) => (
                <div key={s.id} className="rounded-2xl border p-3 bg-background">
                  <div className="text-sm font-medium mb-2">{s.id}</div>
                  <div className="flex flex-wrap gap-2">
                    {s.urls.map((u, i) => (
                      <div key={u} className="relative">
                        <button onClick={()=>setPreview(u)} className="shrink-0">
                          <img src={u} alt={`Foto ${i+1}`} className="h-24 w-24 object-cover rounded-lg border" />
                        </button>
                        <button
                          className={`absolute -top-2 -right-2 text-xs rounded px-1.5 py-0.5 ${s.coverUrl===u? 'bg-blue-600 text-white' : 'bg-slate-200'}`}
                          title="Definir capa"
                          onClick={async()=>{
                            const { getAuth, onAuthStateChanged } = await import('firebase/auth');
                            const a = getAuth();
                            const u = a.currentUser || await new Promise<any>((resolve) => onAuthStateChanged(a, (usr) => resolve(usr), () => resolve(null), { onlyOnce: true } as any));
                            const token = u ? await u.getIdToken() : '';
                            await fetch('/api/storage/photos', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ weekId: s.id, coverUrl: u }) });
                            await fetchList();
                          }}
                        >★</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {items.map((it, i) => (
                <button key={i} onClick={()=>setPreview(it.url)} className="shrink-0">
                  <img src={it.url} alt={it.name} className="h-24 w-24 object-cover rounded-lg border" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col">
          <div className="relative m-4 md:m-10 bg-white rounded-xl shadow-xl overflow-hidden p-4">
            <div className="flex justify-end mb-2">
              <Button size="sm" variant="secondary" onClick={()=>setPreview(null)}>Fechar</Button>
            </div>
            <img src={preview} alt="Foto" className="w-full h-auto max-h-[80vh] object-contain rounded" />
          </div>
        </div>
      )}
    </main>
  );
}
