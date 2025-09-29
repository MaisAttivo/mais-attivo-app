"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import SwitchableEvolution, { EvolutionData } from "@/components/SwitchableEvolution";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, limit, query } from "firebase/firestore";

function parseWeekMondayFromId(id: string): Date | null {
  const m = id.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  // ISO week Monday calculation (UTC)
  const simple = new Date(Date.UTC(year, 0, 1));
  const day = simple.getUTCDay() || 7;
  const isoThursday = new Date(simple);
  isoThursday.setUTCDate(isoThursday.getUTCDate() + (4 - day));
  const monday = new Date(isoThursday);
  monday.setUTCDate(isoThursday.getUTCDate() + (week - 1) * 7 - 3);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}
function mondayOfSameWeekUTC(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7; // 1..7
  if (dow !== 1) d.setUTCDate(d.getUTCDate() - (dow - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default function EvolucaoPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EvolutionData>({ pesoSemanal: [], pesoCheckin: [], massaMuscular: [], massaGorda: [], gorduraVisceral: [], gorduraPercent: [] });
  const [lastGorduraPercent, setLastGorduraPercent] = useState<number | null>(null);

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
        const gorduraPercent: { x: number; y: number }[] = [];

        // Weekly average from dailies (cleaner): group dailyFeedback by ISO week (Monday) and average weight
        try {
          let qD = query(collection(db, `users/${u.uid}/dailyFeedback`), orderBy("date", "asc"), limit(400));
          let dSnap = await getDocs(qD);
          if (dSnap.empty) {
            try { qD = query(collection(db, `users/${u.uid}/dailyFeedback`), orderBy("__name__", "asc"), limit(400)); dSnap = await getDocs(qD); } catch {}
          }
          const map = new Map<number, { sum: number; count: number }>();
          dSnap.forEach((d) => {
            const data: any = d.data() || {};
            const dt: Date = data.date?.toDate?.() || (function(){ const m=d.id.match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m) return null as any; return new Date(Date.UTC(+m[1], +m[2]-1, +m[3])); })();
            const w = typeof data.weight === 'number' ? data.weight : typeof data.peso === 'number' ? data.peso : null;
            if (!dt || typeof w !== 'number') return;
            const monday = mondayOfSameWeekUTC(dt);
            const k = +monday;
            const prev = map.get(k) || { sum: 0, count: 0 };
            prev.sum += w; prev.count += 1;
            map.set(k, prev);
          });
          if (map.size > 0) {
            const arr = Array.from(map.entries()).sort((a,b)=>a[0]-b[0]).map(([k,v])=>({ x: k, y: Number((v.sum / v.count).toFixed(2)) }));
            pesoSemanal.push(...arr);
          } else {
            // Fallback to weeklyFeedback if no dailies
            let qW = query(collection(db, `users/${u.uid}/weeklyFeedback`), orderBy("__name__", "asc"), limit(120));
            let wfSnap = await getDocs(qW);
            if (wfSnap.empty) {
              try { qW = query(collection(db, `users/${u.uid}/weeklyFeedback`), orderBy("weekEndDate", "asc"), limit(120)); wfSnap = await getDocs(qW); } catch {}
            }
            wfSnap.forEach((d) => {
              const id = d.id;
              const val: any = d.get("pesoAtualKg");
              const monday = parseWeekMondayFromId(id);
              if (typeof val === "number" && monday) pesoSemanal.push({ x: +monday, y: val });
            });
          }
        } catch {}

        // Check-ins (peso + outras métricas)
        try {
          let qy = query(collection(db, `users/${u.uid}/checkins`), orderBy("date", "asc"), limit(100));
          let snap = await getDocs(qy);
          if (snap.empty) {
            try { qy = query(collection(db, `users/${u.uid}/checkins`), orderBy("__name__", "asc"), limit(100)); snap = await getDocs(qy); } catch {}
          }
          let latest: number | null = null;
          snap.forEach((docSnap) => {
            const d: any = docSnap.data();
            const dt: Date | null = d.date?.toDate?.() || null;
            const t = dt ? +dt : null;
            if (!t) return;
            if (typeof d.peso === "number") pesoCheckin.push({ x: t, y: d.peso });
            if (typeof d.massaMuscular === "number") massaMuscular.push({ x: t, y: d.massaMuscular });
            if (typeof d.massaGorda === "number") massaGorda.push({ x: t, y: d.massaGorda });
            if (typeof d.gorduraVisceral === "number") gorduraVisceral.push({ x: t, y: d.gorduraVisceral });
            if (typeof d.gorduraPercent === "number") gorduraPercent.push({ x: t, y: d.gorduraPercent });
            if (typeof d.gorduraPercent === "number") latest = d.gorduraPercent;
          });
          setLastGorduraPercent(latest);
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
        <div className="mt-3 text-sm">%Gordura (último CI): <span className="font-medium">{lastGorduraPercent != null ? `${lastGorduraPercent}%` : "—"}</span></div>
      </div>

      <div className="text-xs text-slate-500">Podes deslizar para ver outros gráficos.</div>
    </main>
  );
}
