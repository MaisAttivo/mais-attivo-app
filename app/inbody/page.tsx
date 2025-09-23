"use client";

import { useEffect, useRef, useState } from "react";
import { ClientGuard } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InbodyPage() {
  return (
    <ClientGuard>
      <InbodyContent />
    </ClientGuard>
  );
}

function InbodyContent() {
  const [items, setItems] = useState<Array<{ url: string; name: string; contentType: string; createdAt?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function fetchList() {
    setLoading(true);
    try {
      const { getAuth, onAuthStateChanged } = await import("firebase/auth");
      const a = getAuth();
      const u = a.currentUser || await new Promise<any>((resolve) => onAuthStateChanged(a, (usr) => resolve(usr), () => resolve(null), { onlyOnce: true } as any));
      const token = u ? await u.getIdToken() : "";
      const res = await fetch("/api/storage/inbody", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchList(); }, []);

  async function upload(file: File) {
    if (!file) return;
    setUploading(true);
    setProgressPct(0);
    try {
      const { getAuth, onAuthStateChanged } = await import("firebase/auth");
      const a = getAuth();
      const u = a.currentUser || await new Promise<any>((resolve) => onAuthStateChanged(a, (usr) => resolve(usr), () => resolve(null), { onlyOnce: true } as any));
      const token = u ? await u.getIdToken() : "";
      const fd = new FormData();
      fd.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/storage/inbody");
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / Math.max(1, e.total)) * 100);
        setProgressPct(Math.min(95, pct));
      };
      try {
        await new Promise<void>((resolve, reject) => {
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText)));
          xhr.onerror = () => reject(new Error("network_error"));
          xhr.send(fd);
        });
      } catch (err: any) {
        const msg = typeof err?.message === 'string' ? err.message : 'Falha no envio';
        alert(msg);
        return;
      }
      setProgressPct(100);
      await fetchList();
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
    const f = e.dataTransfer.files?.[0];
    if (f) upload(f);
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>InBody</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`rounded-2xl border border-dashed p-6 sm:p-8 bg-muted/50 flex flex-col items-center justify-center gap-3 text-center transition-colors ${dragOver ? "border-blue-600 bg-muted" : ""}`}
            onDragOver={(e)=>{ e.preventDefault(); setDragOver(true); }}
            onDragLeave={()=>setDragOver(false)}
            onDrop={onDrop}
          >
            <div className="text-sm text-muted-foreground">Arrasta o ficheiro (PDF/JPG/PNG) para aqui ou</div>
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                className="hidden"
                onChange={(e)=>{ const f=e.currentTarget.files?.[0]; if (f) { upload(f); e.currentTarget.value = ""; } }}
              />
              <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? "A enviar…" : "Carregar ficheiro"}
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
            <div className="text-xs text-muted-foreground">Tamanho máx.: 8MB</div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Uploads</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">A carregar…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem anexos.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((it, i) => (
                <div key={i} className="rounded-2xl border p-3 bg-background flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium truncate max-w-[60vw] sm:max-w-[30vw]">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.createdAt ? new Date(it.createdAt).toLocaleString() : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {it.contentType === "application/pdf" ? (
                      <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">Abrir</a>
                    ) : (
                      <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">Ver</a>
                    )}
                    <a href={it.url} download className="text-sm underline">Download</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
