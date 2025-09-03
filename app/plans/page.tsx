"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

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
            <a href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded bg-[#D4AF37] text-white shadow hover:bg-[#BE9B2F]">Abrir</a>
            <a href={url} download className="px-3 py-1.5 rounded border border-slate-400 text-slate-800 bg-white shadow hover:bg-slate-50">Download</a>
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500">Ainda não está disponível.</div>
      )}
    </div>
  );
}

export default function PlansPage() {
  const { uid, role, loading } = useSession();
  const [plan, setPlan] = useState<{ trainingUrl?: string | null; dietUrl?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const targetUidState = useState("");
  const [targetUid, setTargetUid] = targetUidState;
  const isCoach = role === "coach";
  const effectiveUid = useMemo(() => (isCoach && targetUid ? targetUid.trim() : uid || null), [isCoach, targetUid, uid]);

  useEffect(() => {
    if (!effectiveUid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "users", effectiveUid, "plans", "latest"));
        if (alive) setPlan((snap.data() as any) || { trainingUrl: null, dietUrl: null });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [effectiveUid]);

  async function handleUpload(kind: "training" | "diet", file: File) {
    if (!effectiveUid || !file) return;
    const path = `plans/${effectiveUid}/${kind}.pdf`;
    const r = ref(storage, path);
    await uploadBytes(r, file, { contentType: "application/pdf" });
    const url = await getDownloadURL(r);
    const docRef = doc(db, "users", effectiveUid, "plans", "latest");
    const payload: any = { updatedAt: serverTimestamp() };
    if (kind === "training") payload.trainingUrl = url; else payload.dietUrl = url;
    await setDoc(docRef, payload, { merge: true });
    setPlan((p) => ({ ...(p || {}), ...(kind === "training" ? { trainingUrl: url } : { dietUrl: url }) }));
  }

  if (loading) return <main className="max-w-3xl mx-auto p-6">A carregar…</main>;
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
                    <input type="file" accept="application/pdf" onChange={(e)=>{const f=e.target.files?.[0]; if(f) handleUpload("training", f)}} />
                  </div>
                  <div>
                    <div className="text-sm mb-1">Upload Sugestão Alimentar (PDF)</div>
                    <input type="file" accept="application/pdf" onChange={(e)=>{const f=e.target.files?.[0]; if(f) handleUpload("diet", f)}} />
                  </div>
                </div>
              )}
            </div>
          )}

          {loading ? (
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
