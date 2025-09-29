"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClientGuard, useSession } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLisbonDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
  const [items, setItems] = useState<Array<{ url: string; createdAt: Date | null }>>([]);
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

      const rawItems: any[] = Array.isArray(data.items) ? data.items : [];
      const parsedItems = rawItems.map((it) => ({
        url: String(it.url),
        createdAt: it.createdAt ? new Date(it.createdAt) : null,
      }));
      setItems(parsedItems);
    } catch (e: any) {
      setError(e?.message || "Erro");
      setSets([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);
  useEffect(() => {
    try {
      const unsub = (auth as any)?.onIdTokenChanged?.(() => reload());
      return () => { try { unsub && unsub(); } catch {} };
    } catch {}
  }, []);

  return { loading, sets, setSets, items, error, reload };
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
      const token = await auth?.currentUser?.getIdToken();
      let lastJson: any = null;
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append("files", files[i]);
        // progress total = (i completed + current file progress) / total
        lastJson = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/storage/photos");
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const currentPct = Math.floor((e.loaded / e.total) * 100);
              const overall = Math.floor(((i + currentPct / 100) / files.length) * 100);
              setProgress(overall);
            }
          };
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              try {
                const json = JSON.parse(xhr.responseText || "{}");
                if (xhr.status >= 200 && xhr.status < 300) resolve(json);
                else if (json?.error === "too_large") reject(new Error("Máx. 10MB por foto"));
                else if (json?.error === "weekly_limit") reject(new Error("Já enviaste fotos esta semana"));
                else reject(new Error(json?.error === "max_4" ? "Máximo 4 imagens/semana" : json?.message || "Falha ao enviar"));
              } catch (e) {
                if (xhr.status >= 200 && xhr.status < 300) resolve({});
                else reject(new Error("Falha ao enviar"));
              }
            }
          };
          xhr.onerror = () => reject(new Error("Falha de rede"));
          xhr.send(fd);
        });
      }

      if (typeof coverIdx === "number" && Array.isArray(lastJson?.urls) && lastJson?.weekId) {
        const chosenUrl = lastJson.urls[coverIdx] || lastJson.urls[0];
        try {
          const t = await auth?.currentUser?.getIdToken();
          await fetch("/api/storage/photos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
            body: JSON.stringify({ weekId: String(lastJson.weekId), coverUrl: String(chosenUrl) }),
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
        <div className="mt-2 text-xs text-muted-foreground">{weekId ? `Já enviaste fotos esta semana${weekId ? ` (${weekId})` : ""}.` : "Permissão de fotos desativada."}</div>
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

function SetModal({ set, onClose, onSetCover, onDelete, canEdit }: { set: PhotoSet; onClose: () => void; onSetCover: (url: string) => void; onDelete: (url: string) => void; canEdit: boolean }) {
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
              <div className="flex gap-2">
                {set.coverUrl !== u && (
                  <Button size="sm" variant="outline" onClick={() => onSetCover(u)}>Definir como capa</Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="destructive" onClick={() => onDelete(u)}>Remover</Button>
                )}
              </div>
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
  const { loading, sets, setSets, items, reload } = usePhotoSets();
  const [open, setOpen] = useState<PhotoSet | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(false);
  const [consentActive, setConsentActive] = useState<boolean>(false);
  const [consentAt, setConsentAt] = useState<Date | null>(null);

  const firstSet = useMemo(() => (sets.length ? sets[0] : null), [sets]);
  const lastSet = useMemo(() => (sets.length ? sets[sets.length - 1] : null), [sets]);
  const currentWeekId = useMemo(() => isoWeekId(new Date()), []);
  const thisWeekCount = useMemo(() => {
    const s = sets.find((x) => x.id === currentWeekId);
    return s ? s.urls.length : 0;
  }, [sets, currentWeekId]);

  const groupsByDay = useMemo(() => {
    const by: Record<string, string[]> = {};
    // incluir itens do bucket (uploads diretos ou via app)
    for (const it of items) {
      const d = it.createdAt ? new Date(it.createdAt) : null;
      const key = d ? d.toISOString().slice(0,10) : "";
      if (!key) continue;
      if (!by[key]) by[key] = [];
      by[key].push(it.url);
    }
    return Object.entries(by)
      .sort((a,b)=> a[0]<b[0]?1:-1) // desc
      .map(([date, urls]) => ({ date, urls }));
  }, [items]);

  useEffect(() => {
    try {
      const qs = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const hasWelcome = !!qs?.get("welcome");
      if (!hasWelcome) return;
      const key = `welcome_shown_${uid || "anon"}`;
      const seen = typeof window !== "undefined" ? window.localStorage.getItem(key) : "1";
      if (!seen) {
        setShowWelcome(true);
        window.localStorage.setItem(key, "1");
      }
    } catch {}
  }, [uid]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!uid || !db) return;
        const s = await getDoc(doc(db, "users", uid));
        const d: any = s.data() || {};
        setConsentActive(!!d.photoConsentActive);
        const ts = d.photoConsentUpdatedAt?.toDate ? d.photoConsentUpdatedAt.toDate() : (d.photoConsentUpdatedAt ? new Date(d.photoConsentUpdatedAt) : null);
        setConsentAt(ts || null);
      } catch {}
    })();
    return () => { mounted = false; };
  }, [uid]);

  async function toggleConsent() {
    if (!uid || !db) return;
    const next = !consentActive;
    setConsentActive(next);
    try {
      await updateDoc(doc(db, "users", uid), { photoConsentActive: next, photoConsentUpdatedAt: serverTimestamp() });
      setConsentAt(new Date());
    } catch {}
  }

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
            <div className="rounded-2xl border p-4 bg-background">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm" title="Autorizo o uso das minhas fotos para acompanhamento e comunicação/marketing, com o rosto sempre ocultado.">
                  <input type="checkbox" checked={!!consentActive} onChange={toggleConsent} className="h-4 w-4" />
                  <span>Permissão para utilização de fotos para acompanhamento e marketing (rosto sempre tapado)</span>
                </label>
                <div className="text-xs text-muted-foreground">
                  {consentAt ? `Atualizado em ${consentAt.toLocaleString()}` : "Nunca definido"}
                </div>
              </div>
              {!consentActive && (
                <div className="text-xs text-amber-700 mt-2">Ativa a permissão para poderes enviar fotos.</div>
              )}
            </div>

            <Uploader onUploaded={async ()=>{ await reload(); if (showWelcome) router.replace("/dashboard"); }} disabled={!consentActive || thisWeekCount >= 4} weekId={currentWeekId} />

            {loading ? (
              <div className="text-sm text-muted-foreground">A carregar…</div>
            ) : sets.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
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
              <div className="text-sm font-medium">Histórico (semanas)</div>
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

            {groupsByDay.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Histórico por dia</div>
                <div className="grid grid-cols-1 gap-3">
                  {groupsByDay.map((g) => (
                    <div key={g.date} className="rounded-2xl border p-4 bg-background">
                      <div className="font-medium mb-2">{new Date(g.date+"T00:00:00").toLocaleDateString()}</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {g.urls.map((u, i)=>(
                          <div key={i} className="relative h-24 w-full bg-muted rounded-lg overflow-hidden">
                            <img src={u} alt="Foto" className="absolute inset-0 h-full w-full object-cover" />
                          </div>
                        ))}
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
            canEdit={open.id === currentWeekId}
            onDelete={async (url)=>{
              try {
                const t = await auth?.currentUser?.getIdToken();
                const res = await fetch("/api/storage/photos", { method: "DELETE", headers: { "Content-Type": "application/json", ...(t?{ Authorization: `Bearer ${t}` }: {}) }, body: JSON.stringify({ uid, weekId: open.id, url }) });
                if (res.ok) {
                  const j = await res.json();
                  setSets((arr)=>arr.map((s)=> s.id===open.id ? { ...s, urls: j.urls || [], coverUrl: j.coverUrl ?? null } : s));
                  setOpen((prev)=> prev && prev.id===open.id ? { ...prev, urls: (j.urls || []), coverUrl: j.coverUrl ?? null } : prev);
                }
              } catch {}
            }}
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
