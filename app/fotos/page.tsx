"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClientGuard, useSession } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLisbonDate } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";

type PhotoSet = { id: string; createdAt: Date | null; urls: string[]; coverUrl: string | null };

function isoWeekId(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const w = String(weekNo).padStart(2, "0");
  return `${date.getUTCFullYear()}-W${w}`;
}

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
      const mapped: PhotoSet[] = arr.map((s) => {
        let created: Date | null = null;
        const c = s.createdAt;
        if (c) {
          if (typeof (c as any).toDate === "function") created = new Date((c as any).toDate());
          else if (typeof c === "string" || typeof c === "number") created = new Date(c as any);
          else if (typeof (c as any).seconds === "number") created = new Date((c as any).seconds * 1000);
          else if (typeof (c as any)._seconds === "number") created = new Date((c as any)._seconds * 1000);
        }
        const urls = Array.isArray(s.urls) ? s.urls.filter((x: any) => typeof x === "string") : [];
        const coverUrl = typeof s.coverUrl === "string" ? s.coverUrl : (urls[0] || null);
        return { id: String(s.id), createdAt: created, urls, coverUrl } as PhotoSet;
      });
      setSets(mapped.filter((s) => Array.isArray(s.urls) && s.urls.length > 0));
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

function Uploader({ onUploaded, disabled, weekId }: { onUploaded: () => void; disabled?: boolean; weekId?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [coverIdx, setCoverIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const disabledNow = !!disabled;

  function onPick() { inputRef.current?.click(); }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const list = Array.from(e.target.files || []).slice(0, 4);
    const imgs = list.filter((f) => f.type.startsWith("image/")).slice(0, 4);
    setFiles(imgs);
    const urls = imgs.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    setCoverIdx(urls.length > 0 ? 0 : null);
  }

  async function handleUpload() {
    if (disabledNow) { setErr("Já enviaste fotos esta semana"); return; }
    if (files.length === 0) { setErr("Seleciona até 4 imagens"); return; }
    setUploading(true);
    setProgress(0);
    setErr(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const token = await auth?.currentUser?.getIdToken();

      const resJson: any = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/storage/photos");
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.floor((e.loaded / e.total) * 100);
            setProgress(pct);
          }
        };
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            try {
              const json = JSON.parse(xhr.responseText || "{}");
              if (xhr.status >= 200 && xhr.status < 300) resolve(json);
              else if (json?.error === "weekly_limit") reject(new Error("Já enviaste fotos esta semana"));
              else reject(new Error(json?.error === "max_4" ? "Máximo 4 imagens" : json?.message || "Falha ao enviar"));
            } catch (e) {
              if (xhr.status >= 200 && xhr.status < 300) resolve({});
              else reject(new Error("Falha ao enviar"));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Falha de rede"));
        xhr.send(fd);
      });

      if (typeof coverIdx === "number" && Array.isArray(resJson?.urls) && resJson?.weekId) {
        const chosenUrl = resJson.urls[coverIdx] || resJson.urls[0];
        try {
          const t = await auth?.currentUser?.getIdToken();
          await fetch("/api/storage/photos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
            body: JSON.stringify({ weekId: String(resJson.weekId), coverUrl: String(chosenUrl) }),
          });
        } catch {}
      }

      setFiles([]);
      setPreviews([]);
      setCoverIdx(null);
      onUploaded();
    } catch (e: any) {
      setErr(e?.message || "Erro ao enviar");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <div className="rounded-2xl border p-4 bg-background">
      <div className="text-sm font-medium mb-2">Anexa aqui a tua foto</div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleChange} />
      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" onClick={onPick} disabled={uploading || disabledNow}>Escolher imagens</Button>
        <Button size="sm" variant="secondary" onClick={handleUpload} disabled={uploading || files.length === 0 || disabledNow}>
          {uploading ? "A enviar…" : "Enviar"}
        </Button>
        {err && <div className="text-xs text-red-600">{err}</div>}
      </div>

      {disabledNow && (
        <div className="mt-2 text-xs text-muted-foreground">Já enviaste fotos esta semana{weekId ? ` (${weekId})` : ""}.</div>
      )}

      {typeof progress === "number" && (
        <div className="w-full max-w-sm mt-3">
          <div className="h-2 rounded bg-slate-200 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-[11px] text-slate-600 mt-1">{progress}%</div>
        </div>
      )}

      {previews.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {previews.map((src, i) => (
            <div key={i} className="relative">
              <button type="button" className="block w-full" onClick={() => setCoverIdx(i)} disabled={uploading}>
                <div className="relative h-24 w-full bg-muted rounded-lg overflow-hidden">
                  <img src={src} alt={`Pré-visualização ${i + 1}`} className="absolute inset-0 h-full w-full object-cover" />
                </div>
              </button>
              {coverIdx === i && (
                <div className="absolute top-1 left-1 rounded-full bg-blue-600 text-white text-[10px] px-2 py-0.5 shadow">
                  Capa
                </div>
              )}
              <div className="mt-1 flex justify-center">
                <Button size="sm" variant="outline" onClick={() => setCoverIdx(i)} disabled={uploading}>Escolher como capa</Button>
              </div>
            </div>
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
  const router = useRouter();
  const search = useSearchParams();
  const { loading, sets, setSets, reload } = usePhotoSets();
  const [open, setOpen] = useState<PhotoSet | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(false);

  const firstSet = useMemo(() => (sets.length ? sets[0] : null), [sets]);
  const lastSet = useMemo(() => (sets.length ? sets[sets.length - 1] : null), [sets]);

  useEffect(() => {
    if (!search) return;
    const hasWelcome = !!search.get("welcome");
    if (!hasWelcome) return;
    try {
      const key = `welcome_shown_${uid || "anon"}`;
      const seen = typeof window !== "undefined" ? window.localStorage.getItem(key) : "1";
      if (!seen) {
        setShowWelcome(true);
        window.localStorage.setItem(key, "1");
      }
    } catch {}
  }, [search, uid]);

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
            <Uploader onUploaded={async ()=>{ await reload(); if (showWelcome) router.replace("/dashboard"); }} />

            {loading ? (
              <div className="text-sm text-muted-foreground">A carregar…</div>
            ) : sets.length > 0 ? (
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
            ) : null}

            {sets.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-medium">Histórico de Updates</div>
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
            </div>
            )}
          </CardContent>
        </Card>

        {open && (
          <SetModal
            set={open}
            onClose={() => setOpen(null)}
            onSetCover={(url) => { setCover(open.id, url); setOpen({ ...open, coverUrl: url }); }}
          />
        )}
        {showWelcome && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 text-center">
              <h2 className="text-xl font-semibold mb-2">Bem‑vindo ao +ATTIVO!</h2>
              <p className="text-sm text-slate-700 leading-relaxed">
                Para concluir o registo, envia até 4 fotos (frente, lado e trás). Estas imagens registam o teu ponto de partida e ajudam-nos a personalizar o teu acompanhamento.
              </p>
              <div className="mt-4 flex justify-center">
                <Button size="sm" variant="secondary" onClick={()=>setShowWelcome(false)}>Entendi</Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </ClientGuard>
  );
}
