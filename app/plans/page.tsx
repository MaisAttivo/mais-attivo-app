"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/auth";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

function PdfCard({ title, url }: { title: string; url?: string | null }) {
  return (
    <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-4">
      <div className="text-sm text-slate-700 mb-2">{title}</div>
      {url ? (
        <div className="space-y-2">
          <object data={url} type="application/pdf" className="w-full h-64 rounded border" aria-label={title}>
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline">Abrir PDF</a>
          </object>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="secondary"><a href={url} target="_blank" rel="noopener noreferrer">Abrir</a></Button>
            <Button asChild size="sm" variant="outline"><a href={url} download>Download</a></Button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500">Ainda não está disponível.</div>
      )}
    </div>
  );
}

export default function PlansPage() {
  const { uid, role, loading: sessionLoading } = useSession();
  const [plan, setPlan] = useState<{ trainingUrl?: string | null; dietUrl?: string | null } | null>(null);
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
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [dietError, setDietError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveUid) return;
    let alive = true;
    (async () => {
      setPlansLoading(true);
      try {
        const snap = await getDoc(doc(db, "users", effectiveUid, "plans", "latest"));
        if (alive) setPlan((snap.data() as any) || { trainingUrl: null, dietUrl: null });
      } finally {
        if (alive) setPlansLoading(false);
      }
    })();
    return () => { alive = false; };
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
      await uploadBytes(r, file, { contentType: "application/pdf" });
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
      if (kind === "training") setUploadingTraining(false); else setUploadingDiet(false);
    }
  }

  if (sessionLoading) return <main className="max-w-3xl mx-auto p-6">A carregar…</main>;
  if (!uid) return <main className="max-w-3xl mx-auto p-6">Inicia sessão para ver esta página.</main>;
  return (
      <main className="max-w-3xl mx-auto p-6">
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-6">
          <h1 className="text-2xl font-semibold mb-4">Planos</h1>

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
                        {uploadingTraining ? "A enviar…" : "Escolher ficheiro"}
                      </Button>
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
                        {uploadingDiet ? "A enviar…" : "Escolher ficheiro"}
                      </Button>
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
              <PdfCard title="Plano de Treino (PDF)" url={plan?.trainingUrl} />
              <PdfCard title="Sugestão Alimentar (PDF)" url={plan?.dietUrl} />
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-slate-500">
          <div className="font-semibold mb-1">Como configurar o Firebase Storage</div>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Em Firebase Console, ativa Storage e define o bucket em NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.</li>
            <li>Regras recomendadas (ler para clientes, escrever apenas por treinador):</li>
          </ol>
          <pre className="mt-2 bg-slate-100 p-2 rounded overflow-x-auto">
{`rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isSignedIn() { return request.auth != null; }
    function isCoach() { return request.auth.token.coach == true; }

    // planos/{uid}/{kind}.pdf  (kind in [training, diet])
    match /plans/{uid}/{file} {
      allow read: if isSignedIn() && request.auth.uid == uid || isCoach();
      allow write: if isCoach();
    }
  }
}`}
          </pre>
          <ol start={3} className="list-decimal ml-5 space-y-1">
            <li>Cria as pastas automaticamente ao fazer upload (não é preciso criar antes).</li>
            <li>Os PDFs ficam guardados em plans/UID/training.pdf e plans/UID/diet.pdf.</li>
          </ol>
        </div>
      </main>
  );
}
