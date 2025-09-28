"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClientGuard, useSession } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatLisbonDate } from "@/lib/utils";

function isoWeekId(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const w = String(weekNo).padStart(2, "0");
  return `${date.getUTCFullYear()}-W${w}`;
}

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

  return { loading, items, setItems, error, reload };
}

function Uploader({ disabled, onUploaded }: { disabled?: boolean; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState<boolean>(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const disabledNow = !!disabled;

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
    if (disabledNow) { setErr("Já anexaste um InBody esta semana"); return; }
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
        <Button size="sm" onClick={onPick} disabled={uploading || disabledNow}>Escolher ficheiro</Button>
        <Button size="sm" variant="secondary" onClick={handleUpload} disabled={uploading || !file || disabledNow}>
          {uploading ? "A enviar…" : "Enviar"}
        </Button>
        {err && <div className="text-xs text-red-600">{err}</div>}
      </div>

      {disabledNow && (
        <div className="mt-2 text-xs text-muted-foreground">Já anexaste um InBody esta semana.</div>
      )}

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

export default function InbodyPage() {
  const { items, loading, reload } = useInbody();
  const alreadyThisWeek = useMemo(() => {
    if (!items.length) return false;
    const created = items[0]?.createdAt || null;
    if (!created) return false;
    return (Date.now() - created.getTime()) < 7 * 24 * 60 * 60 * 1000;
  }, [items]);

  return (
    <ClientGuard>
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>InBody</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Uploader disabled={alreadyThisWeek} onUploaded={reload} />

            {loading ? (
              <div className="text-sm text-muted-foreground">A carregar…</div>
            ) : items.length > 0 ? (
              <div className="space-y-3">
                <div className="text-sm font-medium">Histórico</div>
                <div className="grid grid-cols-1 gap-3">
                  {items.map((f)=> (
                    <div key={f.id} className="rounded-2xl border p-4 bg-background flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">InBody</div>
                        <div className="text-xs text-muted-foreground">{f.createdAt ? formatLisbonDate(f.createdAt, { dateStyle: "medium", timeStyle: "short" }) : "—"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" asChild>
                          <a href={f.url} target="_blank" rel="noopener noreferrer">Abrir</a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Sem anexos.</div>
            )}
          </CardContent>
        </Card>
      </main>
    </ClientGuard>
  );
}
