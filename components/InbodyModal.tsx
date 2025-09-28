"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type InbodyItem = { id: string; url: string; createdAt: Date | null; contentType?: string };

function useInbody() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InbodyItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch("/api/storage/inbody", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Falha ao carregar");
      const data = await res.json();
      const arr: any[] = Array.isArray(data.items) ? data.items : [];
      const mapped: InbodyItem[] = arr.map((x) => {
        let created: Date | null = null;
        const c: any = x.createdAt;
        if (c) {
          if (typeof c.toDate === "function") created = new Date(c.toDate());
          else if (typeof c === "string" || typeof c === "number") created = new Date(c as any);
          else if (typeof c.seconds === "number") created = new Date(c.seconds * 1000);
          else if (typeof c._seconds === "number") created = new Date(c._seconds * 1000);
        }
        return { id: String(x.name || Math.random()), url: String(x.url), createdAt: created, contentType: x.contentType } as InbodyItem;
      });
      mapped.sort((a,b)=>((b.createdAt?.getTime()||0)-(a.createdAt?.getTime()||0)) || b.id.localeCompare(a.id));
      setItems(mapped);
    } catch (e: any) {
      setError(e?.message || "Erro");
      setItems([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  return { loading, items, error, reload };
}

function Uploader({ disabled, onUploaded }: { disabled?: boolean; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState<boolean>(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onPick() { inputRef.current?.click(); }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const f = e.target.files?.[0] || null;
    if (!f) { setFile(null); setPreviewUrl(null); setIsPdf(false); return; }
    const isPdfType = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!(isPdfType || f.type.startsWith("image/"))) {
      setErr("Escolhe uma imagem ou PDF");
      setFile(null); setPreviewUrl(null); setIsPdf(false);
      return;
    }
    setIsPdf(isPdfType);
    setFile(f);
    setPreviewUrl(isPdfType ? null : URL.createObjectURL(f));
  }

  async function handleUpload() {
    if (!file) { setErr("Seleciona uma imagem ou PDF"); return; }
    setUploading(true); setProgress(0); setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = await auth?.currentUser?.getIdToken();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/storage/inbody");
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.floor((e.loaded / e.total) * 100)); };
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            try {
              const json = JSON.parse(xhr.responseText || "{}");
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else if (xhr.status === 409 && json?.error === "weekly_limit") reject(new Error("Já anexaste um InBody esta semana"));
              else reject(new Error(json?.message || json?.error || "Falha ao enviar"));
            } catch {
              if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error("Falha ao enviar"));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Falha de rede"));
        xhr.send(fd);
      });

      setFile(null); setPreviewUrl(null); setIsPdf(false);
      onUploaded();
    } catch (e: any) {
      setErr(e?.message || "Erro ao enviar");
    } finally { setUploading(false); setProgress(null); }
  }

  return (
    <div className="rounded-2xl border p-4 bg-background">
      <div className="text-sm font-medium mb-2">Anexa o teu InBody (imagem ou PDF)</div>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleChange} />
      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" onClick={onPick} disabled={uploading}>Escolher ficheiro</Button>
        <Button size="sm" variant="secondary" onClick={handleUpload} disabled={uploading || !file}>
          {uploading ? "A enviar…" : "Enviar"}
        </Button>
        {err && <div className="text-xs text-red-600">{err}</div>}
      </div>

      {typeof progress === "number" && (
        <div className="w-full max-w-sm mt-3">
          <div className="h-2 rounded bg-slate-200 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-[11px] text-slate-600 mt-1">{progress}%</div>
        </div>
      )}

      {previewUrl && !isPdf && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="relative">
            <div className="relative h-24 w-full bg-muted rounded-lg overflow-hidden">
              <img src={previewUrl} alt="Pré-visualização" className="absolute inset-0 h-full w-full object-cover" />
            </div>
          </div>
        </div>
      )}

      {isPdf && file && (
        <div className="mt-3 text-xs text-muted-foreground break-words">Ficheiro selecionado: {file.name}</div>
      )}
    </div>
  );
}

function usePinchZoom() {
  const state = useRef({ scale: 1, x: 0, y: 0, lastX: 0, lastY: 0, pointerDown: false, startDist: 0, startScale: 1 }).current;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const setTransform = () => {
    if (!containerRef.current) return;
    containerRef.current.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    state.pointerDown = true; state.lastX = e.clientX; state.lastY = e.clientY;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!state.pointerDown) return;
    const dx = e.clientX - state.lastX; const dy = e.clientY - state.lastY;
    state.x += dx; state.y += dy; state.lastX = e.clientX; state.lastY = e.clientY; setTransform();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    state.pointerDown = false;
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    state.scale = Math.min(8, Math.max(0.2, state.scale * factor));
    setTransform();
  };
  const reset = () => { state.scale = 1; state.x = 0; state.y = 0; setTransform(); };
  const zoomIn = () => { state.scale = Math.min(8, state.scale * 1.2); setTransform(); };
  const zoomOut = () => { state.scale = Math.max(0.2, state.scale / 1.2); setTransform(); };

  return { containerRef, onPointerDown, onPointerMove, onPointerUp, onWheel, reset, zoomIn, zoomOut };
}

function ZoomableViewer({ url, kind }: { url: string; kind: "image" | "pdf" }) {
  const { containerRef, onPointerDown, onPointerMove, onPointerUp, onWheel, reset, zoomIn, zoomOut } = usePinchZoom();
  return (
    <div className="relative w-full h-[70vh] sm:h-[80vh] bg-black/5 rounded-lg overflow-hidden">
      <div className="absolute z-10 right-3 top-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={zoomOut}>−</Button>
        <Button size="sm" variant="outline" onClick={zoomIn}>+</Button>
        <Button size="sm" variant="secondary" onClick={reset}>Repor</Button>
      </div>
      <div className="w-full h-full overflow-auto cursor-grab active:cursor-grabbing" onWheel={onWheel}>
        <div ref={containerRef as any} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="origin-center touch-none select-none">
          {kind === "image" ? (
            <img src={url} alt="InBody" className="max-w-none" />
          ) : (
            <object data={url} type="application/pdf" className="w-[100vw] max-w-none h-[80vh]">
              <iframe className="w-[100vw] h-[80vh]" src={"https://drive.google.com/viewerng/viewer?embedded=true&url="+encodeURIComponent(url)} title="Pré-visualização PDF"></iframe>
            </object>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InbodyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { loading, items, reload } = useInbody();
  const [viewer, setViewer] = useState<{ url: string; kind: "image" | "pdf" } | null>(null);

  const alreadyRecent = useMemo(() => {
    const created = items[0]?.createdAt || null;
    return created ? (Date.now() - created.getTime()) < 7 * 24 * 60 * 60 * 1000 : false;
  }, [items]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 z-10 bg-white border-b flex items-center justify-between px-4 py-3 rounded-t-xl">
          <div className="text-base font-semibold">InBody</div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={()=>{ onClose(); }}>Fechar</Button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <Uploader disabled={alreadyRecent} onUploaded={reload} />
          {loading ? (
            <div className="text-sm text-muted-foreground">A carregar…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem anexos.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {items.map((f) => {
                const kind: "image" | "pdf" = (f.contentType === "application/pdf" || /\.pdf($|\?)/i.test(f.url)) ? "pdf" : "image";
                return (
                  <div key={f.id} className="rounded-2xl border p-4 bg-background flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">InBody</div>
                      <div className="text-xs text-muted-foreground">{f.createdAt ? new Date(f.createdAt).toLocaleString("pt-PT") : "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={()=>setViewer({ url: f.url, kind })}>Ver</Button>
                      <Button asChild size="sm" variant="outline"><a href={f.url} target="_blank" rel="noopener noreferrer">Abrir</a></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {viewer && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex flex-col p-4">
          <div className="flex justify-end mb-2">
            <Button size="sm" variant="secondary" onClick={()=>setViewer(null)}>Fechar</Button>
          </div>
          <ZoomableViewer url={viewer.url} kind={viewer.kind} />
        </div>
      )}
    </div>
  );
}
