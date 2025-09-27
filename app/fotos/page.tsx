"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClientGuard, useSession } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLisbonDate } from "@/lib/utils";

type PhotoSet = { id: string; createdAt: Date | null; urls: string[]; coverUrl: string | null };

function usePhotoSets() {
  const [loading, setLoading] = useState(true);
  const [sets, setSets] = useState<PhotoSet[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch("/api/storage/photos", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Falha ao carregar");
      const data = await res.json();
      const arr: any[] = Array.isArray(data.sets) ? data.sets : [];
      const mapped: PhotoSet[] = arr.map((s) => ({
        id: String(s.id),
        createdAt: s.createdAt ? new Date(s.createdAt.toDate ? s.createdAt.toDate() : s.createdAt) : null,
        urls: Array.isArray(s.urls) ? s.urls.filter((x: any) => typeof x === "string") : [],
        coverUrl: typeof s.coverUrl === "string" ? s.coverUrl : (Array.isArray(s.urls) && typeof s.urls[0] === "string" ? s.urls[0] : null),
      }));
      setSets(mapped);
    } catch (e: any) {
      setError(e?.message || "Erro");
      setSets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  return { loading, sets, setSets, error, reload };
}

function Uploader({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onPick() { inputRef.current?.click(); }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const list = Array.from(e.target.files || []).slice(0, 4);
    const imgs = list.filter((f) => f.type.startsWith("image/")).slice(0, 4);
    setFiles(imgs);
    const urls = imgs.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
  }

  async function handleUpload() {
    if (files.length === 0) { setErr("Seleciona até 4 imagens"); return; }
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch("/api/storage/photos", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error === "max_4" ? "Máximo 4 imagens" : j?.message || "Falha ao enviar");
      }
      setFiles([]);
      setPreviews([]);
      onUploaded();
    } catch (e: any) {
      setErr(e?.message || "Erro ao enviar");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl border p-4 bg-background">
      <div className="text-sm font-medium mb-2">Anexa aqui a tua foto</div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleChange} />
      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" onClick={onPick} disabled={uploading}>Escolher imagens</Button>
        <Button size="sm" variant="secondary" onClick={handleUpload} disabled={uploading || files.length === 0}>
          {uploading ? "A enviar…" : "Enviar"}
        </Button>
        {err && <div className="text-xs text-red-600">{err}</div>}
      </div>
      {previews.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <img key={i} src={src} alt={`Pré-visualização ${i + 1}`} className="h-24 w-24 object-cover rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}

function SetModal({ set, onClose, onSetCover }: { set: PhotoSet; onClose: () => void; onSetCover: (url: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col">
      <div className="relative m-4 md:m-10 bg-white rounded-xl shadow-xl overflow-auto p-4">
        <div className="sticky top-2 right-2 flex justify-end">
          <Button size="sm" variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {set.urls.map((u, i) => (
            <div key={i} className="flex flex-col gap-2">
              <img src={u} alt={`Foto ${i + 1}`} className="w-full rounded-xl object-contain" />
              {set.coverUrl !== u && (
                <div className="flex">
                  <Button size="sm" variant="outline" onClick={() => onSetCover(u)}>Definir como capa</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FotosPage() {
  const { uid } = useSession();
  const { loading, sets, setSets, reload } = usePhotoSets();
  const [open, setOpen] = useState<PhotoSet | null>(null);

  const firstSet = useMemo(() => (sets.length ? sets[0] : null), [sets]);
  const lastSet = useMemo(() => (sets.length ? sets[sets.length - 1] : null), [sets]);

  async function setCover(weekId: string, coverUrl: string) {
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch("/api/storage/photos", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ uid, weekId, coverUrl }),
      });
      if (!res.ok) throw new Error("Falha ao atualizar capa");
      setSets((arr) => arr.map((s) => (s.id === weekId ? { ...s, coverUrl } : s)));
    } catch (_) {
      // noop UI error for brevity
    }
  }

  return (
    <ClientGuard>
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Atualização Fotos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Uploader onUploaded={reload} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border p-4 bg-background">
                <div className="text-sm text-slate-700 mb-2">Início</div>
                {loading ? (
                  <div className="text-sm text-muted-foreground">A carregar…</div>
                ) : !firstSet ? (
                  <div className="text-sm text-muted-foreground">Sem registos.</div>
                ) : (
                  <button className="w-full text-left" onClick={() => setOpen(firstSet)}>
                    <div className="relative w-full h-48 bg-muted rounded-xl overflow-hidden">
                      {firstSet.coverUrl ? (
                        <img src={firstSet.coverUrl} alt="Inicio" className="absolute inset-0 w-full h-full object-contain" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Sem capa</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{firstSet.createdAt ? formatLisbonDate(firstSet.createdAt, { dateStyle: "medium", timeStyle: "short" }) : firstSet.id}</div>
                  </button>
                )}
              </div>
              <div className="rounded-2xl border p-4 bg-background">
                <div className="text-sm text-slate-700 mb-2">Atual</div>
                {loading ? (
                  <div className="text-sm text-muted-foreground">A carregar…</div>
                ) : !lastSet ? (
                  <div className="text-sm text-muted-foreground">Sem registos.</div>
                ) : (
                  <button className="w-full text-left" onClick={() => setOpen(lastSet)}>
                    <div className="relative w-full h-48 bg-muted rounded-xl overflow-hidden">
                      {lastSet.coverUrl ? (
                        <img src={lastSet.coverUrl} alt="Atual" className="absolute inset-0 w-full h-full object-contain" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Sem capa</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{lastSet.createdAt ? formatLisbonDate(lastSet.createdAt, { dateStyle: "medium", timeStyle: "short" }) : lastSet.id}</div>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">Histórico de Updates</div>
              {loading ? (
                <div className="text-sm text-muted-foreground">A carregar…</div>
              ) : sets.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem envios.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {sets.map((s) => (
                    <div key={s.id} className="rounded-2xl border p-4 bg-background flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{s.createdAt ? formatLisbonDate(s.createdAt, { dateStyle: "medium", timeStyle: "short" }) : s.id}</div>
                        <div className="text-xs text-muted-foreground">{s.urls.length} imagem(s)</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setOpen(s)}>Ver</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {open && (
          <SetModal
            set={open}
            onClose={() => setOpen(null)}
            onSetCover={(url) => { setCover(open.id, url); setOpen({ ...open, coverUrl: url }); }}
          />
        )}
      </main>
    </ClientGuard>
  );
}
