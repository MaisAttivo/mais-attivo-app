"use client";

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type Exercise = "agachamento" | "supino" | "levantamento";

type PR = {
  id: string;
  exercise: Exercise;
  weight: number;
  reps: number;
  createdAt?: Date | null;
};

function epley1RM(weight: number, reps: number) {
  const r = Math.max(1, Math.min(12, Math.floor(reps)));
  return +(weight * (1 + r / 30)).toFixed(1);
}

export default function PowerliftingPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [prs, setPrs] = useState<Record<Exercise, PR[]>>({ agachamento: [], supino: [], levantamento: [] });
  const [saving, setSaving] = useState<Record<Exercise, boolean>>({ agachamento: false, supino: false, levantamento: false });
  const [err, setErr] = useState<string | null>(null);

  // form state
  const [w, setW] = useState<Record<Exercise, string>>({ agachamento: "", supino: "", levantamento: "" });
  const [r, setR] = useState<Record<Exercise, string>>({ agachamento: "1", supino: "1", levantamento: "1" });

  useEffect(() => {
    if (!auth) { setUid(null); setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u || !db) { setUid(null); setAllowed(false); return; }
        setUid(u.uid);
        const snap = await getDoc(doc(db, "users", u.uid));
        const data: any = snap.data() || {};
        const ok = !!data.powerlifting;
        setAllowed(ok);
        if (ok) {
          await loadAll(u.uid);
        }
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  async function loadAll(userId: string) {
    try {
      const base = collection(db!, "users", userId, "powerlifting");
      const ex: Exercise[] = ["agachamento", "supino", "levantamento"];
      const result: Record<Exercise, PR[]> = { agachamento: [], supino: [], levantamento: [] };
      for (const e of ex) {
        const qy = query(base, where("exercise", "==", e));
        const qs = await getDocs(qy);
        result[e] = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
          .map((d: any) => ({ ...d, createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : null })) as PR[];
        // sort by 1RM desc, then weight desc, then reps desc
        result[e].sort((a, b) => (epley1RM(b.weight, b.reps) - epley1RM(a.weight, a.reps)) || (b.weight - a.weight) || (b.reps - a.reps));
      }
      setPrs(result);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar PRs");
    }
  }

  async function savePR(exercise: Exercise) {
    if (!uid || !db) return;
    const weight = Number(w[exercise]);
    const reps = Math.max(1, Math.floor(Number(r[exercise])));
    if (!Number.isFinite(weight) || weight <= 0) { setErr("Peso inválido"); return; }
    if (!Number.isFinite(reps) || reps <= 0) { setErr("Reps inválidas"); return; }
    setErr(null);
    setSaving((s) => ({ ...s, [exercise]: true }));
    try {
      await addDoc(collection(db, "users", uid, "powerlifting"), {
        exercise,
        weight,
        reps,
        createdAt: serverTimestamp(),
      });
      setW((x) => ({ ...x, [exercise]: "" }));
      setR((x) => ({ ...x, [exercise]: "1" }));
      await loadAll(uid);
    } catch (e: any) {
      setErr(e?.message || "Falha ao guardar PR");
    } finally {
      setSaving((s) => ({ ...s, [exercise]: false }));
    }
  }

  const best = useMemo(() => {
    const out: Record<Exercise, PR | null> = { agachamento: null, supino: null, levantamento: null };
    (Object.keys(prs) as Exercise[]).forEach((e) => {
      const only1 = prs[e].filter((p) => p.reps === 1).sort((a,b)=> b.weight - a.weight);
      out[e] = only1[0] || null;
    });
    return out;
  }, [prs]);

  if (loading) return <main className="max-w-xl mx-auto p-6">A carregar…</main>;
  if (!uid) return <main className="max-w-xl mx-auto p-6">Inicia sessão.</main>;
  if (!allowed) return <main className="max-w-xl mx-auto p-6">Página indisponível.</main>;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard"><ArrowLeft className="h-4 w-4" />Voltar à dashboard</Link>
        </Button>
      </div>

      <h1 className="text-2xl font-semibold text-center">Powerlifting</h1>

      {err && <div className="rounded-xl border border-rose-300 bg-rose-50 text-rose-700 px-3 py-2 text-sm">{err}</div>}

      <LiftCard
        title="Agachamento"
        exercise="agachamento"
        prs={prs.agachamento}
        best={best.agachamento}
        w={w.agachamento}
        r={r.agachamento}
        onW={(val)=>setW((x)=>({...x, agachamento: val}))}
        onR={(val)=>setR((x)=>({...x, agachamento: val}))}
        saving={saving.agachamento}
        onSave={()=>savePR("agachamento")}
      />

      <LiftCard
        title="Supino"
        exercise="supino"
        prs={prs.supino}
        best={best.supino}
        w={w.supino}
        r={r.supino}
        onW={(val)=>setW((x)=>({...x, supino: val}))}
        onR={(val)=>setR((x)=>({...x, supino: val}))}
        saving={saving.supino}
        onSave={()=>savePR("supino")}
      />

      <LiftCard
        title="Levantamento Terra"
        exercise="levantamento"
        prs={prs.levantamento}
        best={best.levantamento}
        w={w.levantamento}
        r={r.levantamento}
        onW={(val)=>setW((x)=>({...x, levantamento: val}))}
        onR={(val)=>setR((x)=>({...x, levantamento: val}))}
        saving={saving.levantamento}
        onSave={()=>savePR("levantamento")}
      />
    </main>
  );
}

function LiftCard(props: {
  title: string;
  exercise: Exercise;
  prs: PR[];
  best: PR | null;
  w: string;
  r: string;
  onW: (v: string) => void;
  onR: (v: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const { title, prs, best, w, r, onW, onR, saving, onSave } = props;
  return (
    <section className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {best ? (
          <div className="text-sm text-slate-700 mt-2 sm:mt-0">
            Melhor (1RM): <span className="font-semibold">{best.weight} kg × {best.reps}</span>
            <span className="ml-2 text-xs text-slate-500">(~{epley1RM(best.weight, best.reps)} kg)</span>
          </div>
        ) : (
          <div className="text-sm text-slate-500 mt-2 sm:mt-0">Sem 1RM registado</div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Peso (kg)</label>
          <input
            type="number"
            step="0.5"
            placeholder="Ex: 120"
            value={w}
            onChange={(e)=>onW(e.currentTarget.value)}
            className="w-full border rounded-xl px-3 py-2"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Reps</label>
          <input
            type="number"
            step="1"
            min="1"
            placeholder="Ex: 1"
            value={r}
            onChange={(e)=>onR(e.currentTarget.value)}
            className="w-full border rounded-xl px-3 py-2"
          />
        </div>
        <div className="sm:col-span-1">
          <Button className="w-full" onClick={onSave} disabled={saving}>{saving ? "A guardar…" : "Guardar"}</Button>
        </div>
      </div>

      {prs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-600">
              <tr>
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Peso</th>
                <th className="py-2 pr-4">Reps</th>
                <th className="py-2 pr-4">1RM Estimada (Epley)</th>
              </tr>
            </thead>
            <tbody>
              {prs.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2 pr-4">{p.createdAt ? p.createdAt.toLocaleDateString("pt-PT") : "—"}</td>
                  <td className="py-2 pr-4">{p.weight} kg</td>
                  <td className="py-2 pr-4">{p.reps}</td>
                  <td className="py-2 pr-4">{epley1RM(p.weight, p.reps)} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
