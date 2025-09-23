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
  const [items, setItems] = useState<Array<{ url: string; name: string; createdAt?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function fetchList() {
    setLoading(true);
    try {
      const { getAuth } = await import("firebase/auth");
      const u = getAuth().currentUser;
      const token = u ? await u.getIdToken() : "";
      const res = await fetch("/api/storage/photos", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
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
    setUploading(true);
    setProgressPct(0);
    try {
      const { getAuth } = await import("firebase/auth");
      const token = getAuth().currentUser ? await getAuth().currentUser!.getIdToken() : "";
      const fd = new FormData();
      fd.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/storage/photos");
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / Math.max(1, e.total)) * 100);
        setProgressPct(pct);
      };
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText)));
        xhr.onerror = () => reject(new Error("network_error"));
        xhr.send(fd);
      });
      await fetchList();
    } finally {
      setUploading(false);
      setProgressPct(null);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Fotos de Progresso</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e)=>{ const f=e.currentTarget.files?.[0]; if (f) { upload(f); e.currentTarget.value = ""; } }} />
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? "A enviar…" : "Carregar foto"}
            </Button>
            {typeof progressPct === "number" && (
              <div className="w-40 h-2 rounded bg-slate-200 overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: `${progressPct}%` }} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Galeria</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">A carregar…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem fotos.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((it, i) => (
                <button key={i} onClick={()=>setPreview(it.url)} className="shrink-0">
                  <img src={it.url} alt={it.name || `Foto ${i+1}`} className="w-full h-40 object-cover rounded-xl border" />
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
