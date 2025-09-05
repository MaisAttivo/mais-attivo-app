"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import SwitchableEvolution, { EvolutionData } from "@/components/SwitchableEvolution";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, limit, query } from "firebase/firestore";

function parseWeekEndFromId(id: string): Date | null {
  const m = id.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const simple = new Date(Date.UTC(year, 0, 1));
  const day = simple.getUTCDay() || 7;
  const isoThursday = new Date(simple);
  isoThursday.setUTCDate(isoThursday.getUTCDate() + (4 - day));
  const weekStart = new Date(isoThursday);
  weekStart.setUTCDate(isoThursday.getUTCDate() + (week - 1) * 7 - 3); // Monday
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  return weekEnd;
}

export default function EvolucaoPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EvolutionData>({ pesoSemanal: [], pesoCheckin: [], massaMuscular: [], massaGorda: [], gorduraVisceral: [] });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setUid(null); setLoading(false); return; }
      setUid(u.uid);
      setLoading(false);
      try {
        const pesoSemanal: { x: number; y: number }[] = [];
        const pesoCheckin: { x: number; y: number }[] = [];
        const massaMuscular: { x: number; y: number }[] = [];
        const massaGorda: { x: number; y: number }[] = [];
        const gorduraVisceral: { x: number; y: number }[] = [];

        // Weekly weights (limit 60)
        try {
          const wfSnap = await getDocs(query(collection(db, `users/${u.uid}/weeklyFeedback`), limit(60)));
          wfSnap.forEach((d) => {
            const id = d.id;
            const val: any = d.get("pesoAtualKg");
            const dtAny: any = d.get("weekEndDate");
            const date = dtAny?.toDate ? dtAny.toDate() : parseWeekEndFromId(id);
            if (typeof val === "number" && date) pesoSemanal.push({ x: +date, y: val });
          });
        } catch {}

        // Check-ins (peso + outras métricas)
        try {
          let qy = query(collection(db, `users/${u.uid}/checkins`), orderBy("date", "asc"), limit(100));
          let snap = await getDocs(qy);
          if (snap.empty) {
            try { qy = query(collection(db, `users/${u.uid}/checkins`), orderBy("__name__", "asc"), limit(100)); snap = await getDocs(qy); } catch {}
          }
          snap.forEach((docSnap) => {
            const d: any = docSnap.data();
            const dt: Date | null = d.date?.toDate?.() || null;
            const t = dt ? +dt : null;
            if (!t) return;
            if (typeof d.peso === "number") pesoCheckin.push({ x: t, y: d.peso });
            if (typeof d.massaMuscular === "number") massaMuscular.push({ x: t, y: d.massaMuscular });
            if (typeof d.massaGorda === "number") massaGorda.push({ x: t, y: d.massaGorda });
            if (typeof d.gorduraVisceral === "number") gorduraVisceral.push({ x: t, y: d.gorduraVisceral });
          });
        } catch {}

        // Sort
        const asc = (a: { x: number }, b: { x: number }) => a.x - b.x;
        pesoSemanal.sort(asc); pesoCheckin.sort(asc); massaMuscular.sort(asc); massaGorda.sort(asc); gorduraVisceral.sort(asc);

        setData({ pesoSemanal, pesoCheckin, massaMuscular, massaGorda, gorduraVisceral });
      } catch (e) {
        console.error(e);
      }
    });
    return () => unsub();
  }, []);

  if (loading) return <main className="max-w-5xl mx-auto p-6">A carregar…</main>;
  if (!uid) return <main className="max-w-5xl mx-auto p-6">Inicia sessão para ver a evolução.</main>;

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Voltar à dashboard</Link>
        <h1 className="text-2xl font-semibold">Evolução</h1>
        <div className="w-10" />
      </div>

      <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
        <SwitchableEvolution data={data} />
      </div>

      <div className="text-xs text-slate-500">Podes deslizar para ver outros gráficos.</div>
    </main>
  );
}
