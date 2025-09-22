"use client";

"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth";
import { db, storage } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Upload, X, ArrowLeft } from "lucide-react";

function PdfCard({ title, url, onPreview }: { title: string; url?: string | null; onPreview?: (url: string)=>void }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {url ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" onClick={()=>onPreview && url && onPreview(url)}>Ver</Button>
              <Button asChild size="sm" variant="outline"><a href={url} download>Download</a></Button>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <object data={url} type="application/pdf" className="w-full h-48" aria-label="Pré-visualização PDF">
                <iframe className="w-full h-48" src={"https://drive.google.com/viewerng/viewer?embedded=true&url="+encodeURIComponent(url)} title="Pré-visualização PDF (alternativa)"></iframe>
                <div className="p-2 text-xs text-muted-foreground">Não foi possível mostrar a pré-visualização. <a className="underline" href={url} target="_blank" rel="noopener noreferrer">Abrir numa nova janela</a>.</div>
              </object>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Sem plano.</div>
        )}
      </CardContent>
    </Card>
  );
}

function PlansPageContent() {
  const { uid, role, loading: sessionLoading } = useSession();
  const [plan, setPlan] = useState<{ trainingUrl?: string | null; dietUrl?: string | null } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);

  const targetUidState = useState("");
  const [targetUid, setTargetUid] = targetUidState;
  const isCoach = role === "coach";
  const effectiveUid = useMemo(() => (isCoach && targetUid ? targetUid.trim() : uid || null), [isCoach, targetUid, uid]);

  const trainingInputRef = useRef<HTMLInputElement>(null);
  const dietInputRef = useRef<HTMLInputElement>(null);
  const [selectedTraining, setSelectedTraining] = useState<string | null>(null);
  const [selectedDiet, setSelectedDiet] = useState<string | null>(null);
  const [uploadingTraining, setUploadingTraining] = useState(false);
  const [uploadingDiet, setUploadingDiet] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<number | null>(null);
  const [dietProgress, setDietProgress] = useState<number | null>(null);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [dietError, setDietError] = useState<string | null>(null);
  const search = useSearchParams();

  // Prefill client UID in coach mode via query (?clientId or ?uid)
  useEffect(() => {
    if (!isCoach) return;
    const qpUid = (search?.get("clientId") || search?.get("uid") || "").trim();
    if (qpUid && !targetUid) setTargetUid(qpUid);
  }, [isCoach, search, targetUid, setTargetUid]);

  useEffect(() => {
    if (!effectiveUid) return;
    let alive = true;
    (async () => {
      setPlansLoading(true);
      const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> =>
        await Promise.race([
          p,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
        ]);
      try {
        const latestP = withTimeout(
          (async () => {
            try {
              const snap = await getDoc(doc(db, "users", effectiveUid, "plans", "latest"));
              return (snap.data() as any) || {};
            } catch { return {}; }
          })(),
          4000
        );
        const collP = withTimeout(
          (async () => {
            try {
              const qs = await getDocs(collection(db, "users", effectiveUid, "plans"));
              const all: any[] = [];
              qs.forEach((d) => all.push({ id: d.id, ...(d.data() as any) }));
              const treino = all.find((d) => (d.type === "treino" || d.type === "training") && d.url);
              const alim = all.find((d) => (d.type === "alimentacao" || d.type === "diet") && d.url);
              return { trainingUrl: treino?.url, dietUrl: alim?.url };
            } catch { return {}; }
          })(),
          4000
        );
        const storageP = withTimeout(
          (async () => {
            const out: any = {};
            try { out.trainingUrl = await getDownloadURL(ref(storage, `plans/${effectiveUid}/training.pdf`)); } catch {}
            try { out.dietUrl = await getDownloadURL(ref(storage, `plans/${effectiveUid}/diet.pdf`)); } catch {}
            return out;
          })(),
          4000
        );
        const [latest, fromColl, fromStorage] = await Promise.allSettled([latestP, collP, storageP]);
        const a = latest.status === "fulfilled" ? latest.value as any : {};
        const b = fromColl.status === "fulfilled" ? fromColl.value as any : {};
        const c = fromStorage.status === "fulfilled" ? fromStorage.value as any : {};
        const trainingUrl = a.trainingUrl || b.trainingUrl || c.trainingUrl || null;
        const dietUrl = a.dietUrl || b.dietUrl || c.dietUrl || null;
        if (alive) setPlan({ trainingUrl, dietUrl });
      } finally {
        if (alive) setPlansLoading(false);
      }
    })();
    return () => { let _ = alive; _ = false; };
  }, [effectiveUid]);

  async function handleUpload(kind: "training" | "diet", file: File) {
    try {
      if (!effectiveUid || !file) return;
      if (!storage) throw new Error("Storage indisponível. Configura as envs NEXT_PUBLIC_FIREBASE_*");
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) throw new Error("Apenas PDFs são permitidos.");
      if (file.size > 20 * 1024 * 1024) throw new Error("Ficheiro demasiado grande (máx. 20MB).");

      if (kind === "training") { setUploadingTraining(true); setTrainingError(null); }
      else { setUploadingDiet(true); setDietError(null); }

      const path = `plans/${effectiveUid}/${kind}.pdf`;
      const r = ref(storage, path);
      const task = uploadBytesResumable(r, file, { contentType: "application/pdf" });
      task.on("state_changed", (snap) => {
        const pct = Math.round((snap.bytesTransferred / Math.max(1, snap.totalBytes)) * 100);
        if (kind === "training") setTrainingProgress(pct); else setDietProgress(pct);
      });
      await task;
      const url = await getDownloadURL(r);
      const docRef = doc(db, "users", effectiveUid, "plans", "latest");
      const payload: any = { updatedAt: serverTimestamp() };
      if (kind === "training") payload.trainingUrl = url; else payload.dietUrl = url;
      await setDoc(docRef, payload, { merge: true });
      setPlan((p) => ({ ...(p || {}), ...(kind === "training" ? { trainingUrl: url } : { dietUrl: url }) }));
    } catch (e: any) {
      const msg = e?.message || "Falha no upload.";
      if (kind === "training") setTrainingError(msg); else setDietError(msg);
      console.error("Upload planos falhou", e);
    } finally {
      if (kind === "training") { setUploadingTraining(false); setTrainingProgress(null); }
      else { setUploadingDiet(false); setDietProgress(null); }
    }
  }

  if (sessionLoading) return <main className="max-w-3xl mx-auto p-6">A carregar…</main>;
  if (!uid) return <main className="max-w-3xl mx-auto p-6">Inicia sessão para ver esta página.</main>;
  return (
      <main className="max-w-3xl mx-auto p-6">
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h1 className="text-2xl font-semibold">Planos</h1>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard"><ArrowLeft className="h-4 w-4" />Voltar à dashboard</Link>
            </Button>
          </div>

          {isCoach && (
            <div className="mb-4 p-3 rounded-lg border border-slate-300 bg-slate-50">
              <div className="text-sm font-medium mb-2">Modo treinador</div>
              <label className="block text-sm mb-2">UID do cliente</label>
              <input value={targetUid} onChange={(e)=>setTargetUid(e.target.value)} placeholder="users/{uid}" className="w-full border rounded px-3 py-2 mb-3" />
              {effectiveUid && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm mb-1">Upload Plano de Treino (PDF)</div>
                    <div className="flex flex-col items-start gap-2">
                      <input
                        ref={trainingInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden" aria-hidden="true"
                        onChange={(e)=>{const f=e.currentTarget.files?.[0]; if(f){ setSelectedTraining(f.name); handleUpload("training", f); e.currentTarget.value = ""; }}}
                      />
                      <Button size="sm" onClick={() => trainingInputRef.current?.click()} disabled={uploadingTraining}>
                        <Upload className="h-4 w-4" />
                        {uploadingTraining ? `A enviar… ${trainingProgress ?? 0}%` : "Escolher ficheiro"}
                      </Button>
                      {typeof trainingProgress === "number" && (
                        <div className="w-full max-w-xs">
                          <div className="h-2 rounded bg-slate-200 overflow-hidden">
                            <div className="h-full bg-blue-600 transition-all" style={{ width: `${trainingProgress}%` }} />
                          </div>
                          <div className="text-[11px] text-slate-600 mt-1">{trainingProgress}%</div>
                        </div>
                      )}
                      {trainingError ? (
                        <div className="text-xs text-red-600 text-left">{trainingError}</div>
                      ) : (
                        <div className="text-xs text-slate-600 leading-relaxed text-left max-w-full truncate">{selectedTraining ?? "Nenhum ficheiro selecionado"}</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm mb-1">Upload Sugestão Alimentar (PDF)</div>
                    <div className="flex flex-col items-start gap-2">
                      <input
                        ref={dietInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden" aria-hidden="true"
                        onChange={(e)=>{const f=e.currentTarget.files?.[0]; if(f){ setSelectedDiet(f.name); handleUpload("diet", f); e.currentTarget.value = ""; }}}
                      />
                      <Button size="sm" onClick={() => dietInputRef.current?.click()} disabled={uploadingDiet}>
                        <Upload className="h-4 w-4" />
                        {uploadingDiet ? `A enviar… ${dietProgress ?? 0}%` : "Escolher ficheiro"}
                      </Button>
                      {typeof dietProgress === "number" && (
                        <div className="w-full max-w-xs">
                          <div className="h-2 rounded bg-slate-200 overflow-hidden">
                            <div className="h-full bg-blue-600 transition-all" style={{ width: `${dietProgress}%` }} />
                          </div>
                          <div className="text-[11px] text-slate-600 mt-1">{dietProgress}%</div>
                        </div>
                      )}
                      {dietError ? (
                        <div className="text-xs text-red-600 text-left">{dietError}</div>
                      ) : (
                        <div className="text-xs text-slate-600 leading-relaxed text-left max-w-full truncate">{selectedDiet ?? "Nenhum ficheiro selecionado"}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {plansLoading ? (
            <div className="text-sm text-slate-600">A carregar…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PdfCard title="Plano de Treino" url={plan?.trainingUrl} onPreview={setPreviewUrl} />
              <PdfCard title="Sugestão Alimentar" url={plan?.dietUrl} onPreview={setPreviewUrl} />
            </div>
          )}

          {previewUrl && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col">
              <div className="relative m-4 md:m-10 bg-white rounded-xl shadow-xl flex-1 overflow-hidden">
                <div className="absolute top-3 right-3 flex gap-2">
                  <Button size="sm" variant="outline" asChild><a href={previewUrl} download>Download</a></Button>
                  <Button size="sm" variant="secondary" onClick={()=>setPreviewUrl(null)}><X className="h-4 w-4" />Fechar</Button>
                </div>
                <object data={previewUrl} type="application/pdf" className="w-full h-full" aria-label="Pré-visualização PDF">
                  <iframe className="w-full h-full" src={"https://drive.google.com/viewerng/viewer?embedded=true&url="+encodeURIComponent(previewUrl)} title="Pré-visualização PDF (alternativa)"></iframe>
                  <div className="p-6 text-sm">Não foi possível embutir o PDF. <a className="underline" href={previewUrl} target="_blank" rel="noopener noreferrer">Abrir numa nova janela</a>.</div>
                </object>
              </div>
            </div>
          )}
        </div>

      </main>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={<main className="max-w-3xl mx-auto p-6">A carregar…</main>}>
      <PlansPageContent />
    </Suspense>
  );
}
