"use client";

"use client";

import { useEffect, useRef, useState, useMemo, type ChangeEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
  onSnapshot,
  addDoc,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import CoachGuard from "@/components/ui/CoachGuard";
import { ref, uploadBytesResumable, uploadBytes, getDownloadURL, listAll, getMetadata } from "firebase/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lisbonYMD, lisbonTodayYMD } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Info, Upload, FileText, X, ArrowLeft } from "lucide-react";
import ZoomViewer from "@/components/ZoomViewer";
import SwitchableEvolution, { type EvolutionData } from "@/components/SwitchableEvolution";
import SwitchableCalendar from "@/components/SwitchableCalendar";
import { pushPagamento, pushMarcarCheckin, pushRegistosDiarios, pushRegistoSemanal, pushFotos, pushHidratacao, pushPlanosAnexados } from "@/lib/push";

/* ===== Helpers ===== */
const num = (v: any) => (typeof v === "number" && !Number.isNaN(v) ? v : null);
const toDate = (ts?: Timestamp | null) => (ts ? ts.toDate() : null);
const toDateFlexible = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(`${v}T00:00:00Z`);
  return null;
};
const ymd = (d: Date | null | undefined) => (d ? lisbonYMD(d) : "—");
const todayLisbonYMD = () => lisbonTodayYMD();

type Daily = {
  id: string;
  date?: Timestamp;
  weight?: number | null;
  peso?: number | null;
  waterLiters?: number | null;
  aguaLitros?: number | null;
  metaAgua?: number | null;
  steps?: number | null;
  passos?: number | null;
  didWorkout?: boolean | null;
  treinou?: boolean | null;
  alimentacao100?: boolean | null;
  notes?: string | null;
};

type Checkin = {
  id: string;
  date?: Timestamp | null;
  nextDate?: Timestamp | null;
  type?: "online" | "presencial";
  commentPublic?: string | null;
  weight?: number | null;
  peso?: number | null;
  massaMuscular?: number | null;
  massaGorda?: number | null;
  objetivoPeso?: "ganho" | "perda" | null;
  metaAgua?: number | null;
};

type Weekly = {
  id: string;
  weekEndDate?: Timestamp | null;
  howWasTheWeek?: string;
  energyLevels?: string;
  sleepQuality?: string;
  stressLevels?: string;
  dietChallenges?: string;
  workoutChallenges?: string;
};

type PLExercise = "agachamento" | "supino" | "levantamento";

type PR = {
  id: string;
  exercise: PLExercise;
  weight: number;
  reps: number;
  createdAt?: Date | null;
};

function epley1RM(weight: number, reps: number) {
  const r = Math.max(1, Math.min(12, Math.floor(reps)));
  return +(weight * (1 + r / 30)).toFixed(1);
}

export default function CoachClientProfilePage() {
  const params = useParams<{ uid: string }>();
  const uid = params?.uid as string;

  const [loading, setLoading] = useState(true);

  // Header info
  const [name, setName] = useState<string>("Cliente");
  const [email, setEmail] = useState<string>("—");
  const [active, setActive] = useState<boolean>(true);
  const [savingActive, setSavingActive] = useState<boolean>(false);
  const [lastCheckinYMD, setLastCheckinYMD] = useState<string | null>(null);
  const [nextCheckinYMD, setNextCheckinYMD] = useState<string | null>(null);
  const [nextDue, setNextDue] = useState<boolean>(false);
  const [phone, setPhone] = useState<string | null>(null);

  // Hydration target
  const [metaAgua, setMetaAgua] = useState<number | null>(null);
  const [metaSource, setMetaSource] =
    useState<"daily" | "checkin" | "questionnaire" | "default">("default");

  // Questionnaire extra
  const [workoutFrequency, setWorkoutFrequency] = useState<number | null>(null);
  const [onboarding, setOnboarding] = useState<any | null>(null);

  // Data
  const [dailies, setDailies] = useState<Daily[]>([]);
  const [weekly, setWeekly] = useState<Weekly | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  // Planos PDF
  const [trainingUrl, setTrainingUrl] = useState<string | null>(null);
  const [dietUrl, setDietUrl] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState<boolean>(true);
  const trainingInputRef = useRef<HTMLInputElement>(null);
  const dietInputRef = useRef<HTMLInputElement>(null);
  const [trainingSelected, setTrainingSelected] = useState<string | null>(null);
  const [dietSelected, setDietSelected] = useState<string | null>(null);
  const [uploadingTraining, setUploadingTraining] = useState(false);
  const [uploadingDiet, setUploadingDiet] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<number | null>(null);
  const [dietProgress, setDietProgress] = useState<number | null>(null);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [dietError, setDietError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; kind: "pdf" | "image" } | null>(null);
  const [trainingAt, setTrainingAt] = useState<Date | null>(null);
  const [dietAt, setDietAt] = useState<Date | null>(null);

  // InBody files
  const [inbodyLoading, setInbodyLoading] = useState<boolean>(true);
  const [inbodyFiles, setInbodyFiles] = useState<Array<{ id: string; url: string; createdAt: Date | null }>>([]);
  const [photosLoading, setPhotosLoading] = useState<boolean>(true);
  const [photoSets, setPhotoSets] = useState<Array<{ id: string; createdAt: Date | null; mainUrl: string; urls: string[] }>>([]);
  const [openSet, setOpenSet] = useState<{ id: string; urls: string[] } | null>(null);
  const [photoItems, setPhotoItems] = useState<Array<{ url: string; createdAt: Date | null }>>([]);
  const [openDay, setOpenDay] = useState<{ date: string; urls: string[] } | null>(null);
  const [photoConsentActive, setPhotoConsentActive] = useState<boolean | null>(null);
  const [photoConsentAt, setPhotoConsentAt] = useState<Date | null>(null);

  async function downloadUrl(url: string, filename: string) {
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = filename;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ try{ document.body.removeChild(a); URL.revokeObjectURL(obj); }catch{} }, 0);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ try{ document.body.removeChild(a); }catch{} }, 0);
    }
  }
  async function downloadAll(urls: string[], base: string) {
    for (let i = 0; i < urls.length; i++) {
      await downloadUrl(urls[i], `${base}-${String(i+1).padStart(2,'0')}.jpg`);
      await new Promise(r=>setTimeout(r, 150));
    }
  }


  // Powerlifting flag
  const [plEnabled, setPlEnabled] = useState<boolean>(false);
  const [imgConsent, setImgConsent] = useState<boolean>(false);
  const [imgConsentAt, setImgConsentAt] = useState<Date | null>(null);

  const [visibleSection, setVisibleSection] = useState<"daily" | "weekly" | "planos" | "fotos" | "inbody" | "checkins" | "powerlifting" | "evolucao" | "calendario" | "onboarding" | "notificacoes">("daily");

  const [plPrs, setPlPrs] = useState<Record<PLExercise, PR[]>>({ agachamento: [], supino: [], levantamento: [] });
  const [plShowCount, setPlShowCount] = useState<Record<PLExercise, number>>({ agachamento: 10, supino: 10, levantamento: 10 });

  const groupsByDay = useMemo(() => {
    const by: Record<string, string[]> = {};
    for (const it of photoItems) {
      const d = it.createdAt ? new Date(it.createdAt) : null;
      const key = d ? d.toISOString().slice(0,10) : "";
      if (!key) continue;
      if (!by[key]) by[key] = [];
      by[key].push(it.url);
    }
    return Object.entries(by).sort((a,b)=> a[0] < b[0] ? 1 : -1).map(([date, urls])=>({ date, urls }));
  }, [photoItems]);

  async function loadPlAll(userId: string) {
    try {
      const base = collection(db, "users", userId, "powerlifting");
      const result: Record<PLExercise, PR[]> = { agachamento: [], supino: [], levantamento: [] };
      const qs = await getDocs(base);
      qs.docs.forEach((d) => {
        const obj: any = d.data();
        const ex = (obj.exercise as PLExercise) || null;
        if (!ex || !(ex === "agachamento" || ex === "supino" || ex === "levantamento")) return;
        const rec: PR = {
          id: d.id,
          exercise: ex,
          weight: Number(obj.weight) || 0,
          reps: Math.max(1, Math.floor(Number(obj.reps) || 1)),
          createdAt: obj.createdAt?.toDate ? obj.createdAt.toDate() : null,
        };
        result[ex].push(rec);
      });
      (Object.keys(result) as PLExercise[]).forEach((e) => {
        result[e].sort(
          (a, b) => epley1RM(b.weight, b.reps) - epley1RM(a.weight, a.reps) || b.weight - a.weight || b.reps - a.reps
        );
      });
      setPlPrs(result);
    } catch (e) {
      // swallow errors to avoid breaking coach page
    }
  }

  // Evolução (gráficos)
  const [evoData, setEvoData] = useState<EvolutionData>({ pesoSemanal: [], pesoCheckin: [], massaMuscular: [], massaGorda: [], gorduraVisceral: [], gorduraPercent: [] });

  function parseWeekMondayFromId(id: string): Date | null {
    const m = id.match(/^(\d{4})-W(\d{2})$/);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const week = parseInt(m[2], 10);
    const simple = new Date(Date.UTC(year, 0, 1));
    const day = simple.getUTCDay() || 7;
    const isoThursday = new Date(simple);
    isoThursday.setUTCDate(isoThursday.getUTCDate() + (4 - day));
    const monday = new Date(isoThursday);
    monday.setUTCDate(isoThursday.getUTCDate() + (week - 1) * 7 - 3);
    monday.setUTCHours(0, 0, 0, 0);
    return monday;
  }

  useEffect(() => {
    (async () => {
      setLoading(true);

      // users/{uid}
      const uSnap = await getDoc(doc(db, "users", uid));
      const u = (uSnap.data() as any) || {};
      setEmail(u.email ?? "—");
      try { const p = (u.phone ?? u.phoneNumber ?? u.telefone ?? "").toString().trim(); setPhone(p || null); } catch { setPhone(null); }
      setActive(typeof u.active === "boolean" ? u.active : true);
      setPlEnabled(!!u.powerlifting);
      setImgConsent(!!u.imageUseConsent);
      setImgConsentAt(toDate(u.imageUseConsentAt ?? null));

      const userLastDt = toDateFlexible(u.lastCheckinDate);
      const userNextDt = toDateFlexible(u.nextCheckinDate);

      setLastCheckinYMD(userLastDt ? ymd(userLastDt) : null);
      setNextCheckinYMD(userNextDt ? ymd(userNextDt) : null);
      if (userNextDt) {
        const today = todayLisbonYMD();
        const ndY = ymd(userNextDt);
        setNextDue(!!ndY && ndY <= today);
      } else {
        setNextDue(false);
      }

      // questionnaire (último)
      let qd: any = null;
      try {
        let qSnap = await getDocs(
          query(collection(db, `users/${uid}/questionnaire`), orderBy("completedAt", "desc"), limit(1))
        );
        if (qSnap.empty) {
          try {
            qSnap = await getDocs(
              query(collection(db, `users/${uid}/questionnaire`), orderBy("createdAt", "desc"), limit(1))
            );
          } catch {}
        }
        if (qSnap.empty) {
          qSnap = await getDocs(
            query(collection(db, `users/${uid}/questionnaire`), orderBy("__name__", "desc"), limit(1))
          );
        }
        qd = qSnap.empty ? null : (qSnap.docs[0].data() as any);
      } catch {}
      setName((qd?.fullName || u.fullName || u.name || u.nome || u.email || "Cliente").toString());
      setWorkoutFrequency(num(qd?.workoutFrequency));
      setOnboarding(qd);

      // dailies (7)
      const dSnap = await getDocs(
        query(collection(db, `users/${uid}/dailyFeedback`), orderBy("date", "desc"), limit(7))
      );
      const dailiesLocal: Daily[] = dSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Daily));
      setDailies(dailiesLocal);

      // weekly (último)
      const wSnap = await getDocs(
        query(collection(db, `users/${uid}/weeklyFeedback`), orderBy("weekEndDate", "desc"), limit(1))
      );
      setWeekly(wSnap.empty ? null : ({ id: wSnap.docs[0].id, ...(wSnap.docs[0].data() as any) } as Weekly));

      // check-ins (5)
      const cSnap = await getDocs(
        query(collection(db, `users/${uid}/checkins`), orderBy("date", "desc"), limit(5))
      );
      const checkinsLocal: Checkin[] = cSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Checkin));
      setCheckins(checkinsLocal);

      // ==== Evolução (dados) ====
      try {
        const pesoSemanal: { x: number; y: number }[] = [];
        const pesoCheckin: { x: number; y: number }[] = [];
        const massaMuscular: { x: number; y: number }[] = [];
        const massaGorda: { x: number; y: number }[] = [];
        const gorduraVisceral: { x: number; y: number }[] = [];
        const gorduraPercent: { x: number; y: number }[] = [];

        // Weekly average from dailies for a cleaner chart
        let qD = query(collection(db, `users/${uid}/dailyFeedback`), orderBy("date", "asc"), limit(400));
        let dSnap = await getDocs(qD);
        if (dSnap.empty) {
          try { qD = query(collection(db, `users/${uid}/dailyFeedback`), orderBy("__name__", "asc"), limit(400)); dSnap = await getDocs(qD); } catch {}
        }
        const wmap = new Map<number, { sum: number; count: number }>();
        dSnap.forEach((doc) => {
          const data: any = doc.data() || {};
          const dt: Date = data.date?.toDate?.() || (function(){ const m=doc.id.match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m) return null as any; return new Date(Date.UTC(+m[1], +m[2]-1, +m[3])); })();
          const w = typeof data.weight === 'number' ? data.weight : typeof data.peso === 'number' ? data.peso : null;
          if (!dt || typeof w !== 'number') return;
          const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
          const dow = d.getUTCDay() || 7; if (dow !== 1) d.setUTCDate(d.getUTCDate() - (dow - 1)); d.setUTCHours(0,0,0,0);
          const k = +d;
          const prev = wmap.get(k) || { sum: 0, count: 0 };
          prev.sum += w; prev.count += 1;
          wmap.set(k, prev);
        });
        if (wmap.size > 0) {
          const arr = Array.from(wmap.entries()).sort((a,b)=>a[0]-b[0]).map(([k,v])=>({ x: k, y: Number((v.sum / v.count).toFixed(2)) }));
          pesoSemanal.push(...arr);
        } else {
          // Fallback to weeklyFeedback if no dailies
          let qW = query(collection(db, `users/${uid}/weeklyFeedback`), orderBy("__name__", "asc"), limit(120));
          let wfSnap = await getDocs(qW);
          if (wfSnap.empty) {
            try { qW = query(collection(db, `users/${uid}/weeklyFeedback`), orderBy("weekEndDate", "asc"), limit(120)); wfSnap = await getDocs(qW); } catch {}
          }
          wfSnap.forEach((d) => {
            const id = d.id;
            const val: any = (d.data() as any).pesoAtualKg;
            const monday = parseWeekMondayFromId(id);
            if (typeof val === "number" && monday) pesoSemanal.push({ x: +monday, y: val });
          });
        }

        // Check-ins (até 100)
        let qC = query(collection(db, `users/${uid}/checkins`), orderBy("date", "asc"), limit(100));
        let cAll = await getDocs(qC);
        if (cAll.empty) {
          try { qC = query(collection(db, `users/${uid}/checkins`), orderBy("__name__", "asc"), limit(100)); cAll = await getDocs(qC); } catch {}
        }
        cAll.forEach((docSnap) => {
          const d: any = docSnap.data();
          const dt: Date | null = d.date?.toDate?.() || null;
          const t = dt ? +dt : null;
          if (!t) return;
          if (typeof d.peso === "number") pesoCheckin.push({ x: t, y: d.peso });
          if (typeof d.massaMuscular === "number") massaMuscular.push({ x: t, y: d.massaMuscular });
          if (typeof d.massaGorda === "number") massaGorda.push({ x: t, y: d.massaGorda });
          if (typeof d.gorduraVisceral === "number") gorduraVisceral.push({ x: t, y: d.gorduraVisceral });
          if (typeof d.gorduraPercent === "number") gorduraPercent.push({ x: t, y: d.gorduraPercent });
        });

        const asc = (a: { x: number }, b: { x: number }) => a.x - b.x;
        pesoSemanal.sort(asc); pesoCheckin.sort(asc); massaMuscular.sort(asc); massaGorda.sort(asc); gorduraVisceral.sort(asc); gorduraPercent.sort(asc);
        setEvoData({ pesoSemanal, pesoCheckin, massaMuscular, massaGorda, gorduraVisceral, gorduraPercent });
      } catch (e) {
        console.error("evolução load falhou", e);
      }

      // Fallback Último/Próximo CI a partir do último check-in
      if (!userLastDt && checkinsLocal[0]?.date) {
        const dt = toDate(checkinsLocal[0].date ?? null);
        setLastCheckinYMD(ymd(dt));
      }
      if (!userNextDt && checkinsLocal[0]?.nextDate) {
        const nd = toDate(checkinsLocal[0].nextDate ?? null);
        setNextCheckinYMD(ymd(nd));
        if (nd) {
          const today = todayLisbonYMD();
          const ndY = ymd(nd);
          setNextDue(!!ndY && ndY <= today);
        }
      }

      // coachNotes/default
      const notes: Record<string, string> = {};
      for (const c of checkinsLocal) {
        try {
          const noteRef = doc(db, `users/${uid}/checkins/${c.id}/coachNotes/default`);
          const noteSnap = await getDoc(noteRef);
          notes[c.id] = (noteSnap.exists() ? (noteSnap.data() as any).privateComment : "") || "";
        } catch {}
      }
      setNoteById(notes);

      // meta de água: daily → checkin → questionnaire → default
      const lastDailyLocal = dailiesLocal[0];
      const lastCheckinLocal = checkinsLocal[0];

      let meta: number | null = null;
      let source: "daily" | "checkin" | "questionnaire" | "default" = "default";

      const fromDaily =
        num(lastDailyLocal?.metaAgua) ??
        ((num(lastDailyLocal?.weight) ?? num(lastDailyLocal?.peso)) != null
          ? Number((((num(lastDailyLocal?.weight) ?? num(lastDailyLocal?.peso)) as number) * 0.05).toFixed(2))
          : null);

      if (fromDaily != null) {
        meta = fromDaily;
        source = "daily";
      } else if (
        num(lastCheckinLocal?.metaAgua) != null ||
        num(lastCheckinLocal?.weight) != null ||
        num(lastCheckinLocal?.peso) != null
      ) {
        meta =
          num(lastCheckinLocal?.metaAgua) ??
          Number((((num(lastCheckinLocal?.weight) ?? num(lastCheckinLocal?.peso)) as number) * 0.05).toFixed(2));
        source = "checkin";
      } else if (
        qd &&
        (num(qd.metaAgua) != null || num(qd.weight) != null || num(qd.peso) != null || num(qd.weightKg) != null)
      ) {
        meta =
          num(qd.metaAgua) ??
          Number((((num(qd.weight) ?? num(qd.peso) ?? num(qd.weightKg)) as number) * 0.05).toFixed(2));
        source = "questionnaire";
      } else {
        meta = 3.0;
        source = "default";
      }
      setMetaAgua(meta);
      setMetaSource(source);

      // Carregar planos (PDFs) com paralelismo e timeout
      try {
        const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> =>
          await Promise.race([
            p,
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
          ]);
        const latestP = withTimeout(
          (async () => { try { const s = await getDoc(doc(db, "users", uid, "plans", "latest")); return (s.data() as any) || {}; } catch { return {}; } })(),
          4000
        );
        const collP = withTimeout(
          (async () => { try { const qs = await getDocs(collection(db, `users/${uid}/plans`)); const all: any[] = []; qs.forEach(d=> all.push({ id: d.id, ...(d.data() as any) })); const treino = all.find(d => (d.type == "treino" || d.type == "training") && d.url); const alim = all.find(d => (d.type == "alimentacao" || d.type == "diet") && d.url); return { trainingUrl: treino?.url, dietUrl: alim?.url, trainingUpdatedAt: treino?.createdAt || treino?.updatedAt, dietUpdatedAt: alim?.createdAt || alim?.updatedAt }; } catch { return {}; } })(),
          4000
        );
        const storageP = withTimeout(
          (async () => { const out: any = {}; try { out.trainingUrl = await getDownloadURL(ref(storage, `plans/${uid}/training.pdf`)); } catch {} try { out.dietUrl = await getDownloadURL(ref(storage, `plans/${uid}/diet.pdf`)); } catch {} return out; })(),
          4000
        );
        const [aR, bR, cR] = await Promise.allSettled([latestP, collP, storageP]);
        const a = aR.status === "fulfilled" ? aR.value as any : {};
        const b = bR.status === "fulfilled" ? bR.value as any : {};
        const c = cR.status === "fulfilled" ? cR.value as any : {};
        const trainingUrl = a.trainingUrl || b.trainingUrl || c.trainingUrl || null;
        const dietUrl = a.dietUrl || b.dietUrl || c.dietUrl || null;
        setTrainingUrl(trainingUrl);
        setDietUrl(dietUrl);
        setTrainingAt(toDate(a.trainingUpdatedAt ?? b.trainingUpdatedAt ?? null));
        setDietAt(toDate(a.dietUpdatedAt ?? b.dietUpdatedAt ?? null));
      } catch {}
      setPlansLoading(false);

      // Listar Fotos (via API server-side, sem depender de Storage Rules no cliente)
      try {
        const { getAuth } = await import("firebase/auth");
        const token = getAuth().currentUser ? await getAuth().currentUser!.getIdToken() : "";
        const res = await fetch(`/api/storage/photos?uid=${encodeURIComponent(uid)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        let arrFinal: Array<{ id: string; createdAt: Date | null; mainUrl: string; urls: string[] }> = [];
        if (res.ok) {
          const data = await res.json();
          const rawItems: Array<{ url: string; name: string; createdAt?: string | null }> = Array.isArray(data.items) ? data.items : [];
          const mappedItems = rawItems.map(it => ({ url: String(it.url), createdAt: it.createdAt ? new Date(it.createdAt) : null }));
          setPhotoItems(mappedItems);
          const sets: Array<{ id: string; createdAt?: any; urls?: string[]; coverUrl?: string | null }> = Array.isArray(data.sets) ? data.sets : [];
          if (sets.length > 0) {
            arrFinal = sets.map((s)=>{
              let created: Date | null = null;
              const c: any = (s as any).createdAt;
              if (c) {
                if (typeof c.toDate === 'function') created = c.toDate();
                else if (typeof c === 'string' || typeof c === 'number') created = new Date(c as any);
                else if (typeof c.seconds === 'number') created = new Date(c.seconds * 1000);
                else if (typeof c._seconds === 'number') created = new Date(c._seconds * 1000);
              }
              const urls = Array.isArray(s.urls) ? s.urls.filter((u)=> typeof u === 'string') : [];
              const main = typeof (s as any).coverUrl === 'string' ? (s as any).coverUrl : (urls[0] || "");
              return { id: String(s.id), createdAt: created, mainUrl: main, urls };
            }).sort((a,b)=> (a.createdAt?.getTime()||0)-(b.createdAt?.getTime()||0));
          } else {
            const items: Array<{ url: string; name: string; createdAt?: string | null }> = Array.isArray(data.items) ? data.items : [];
            arrFinal = items.map((it) => ({ id: it.name || String(Math.random()), createdAt: it.createdAt ? new Date(it.createdAt) : null, mainUrl: it.url, urls: [it.url] }))
              .sort((a,b)=> (a.createdAt?.getTime()||0)-(b.createdAt?.getTime()||0));
          }
        }
        setPhotoSets(arrFinal);
      } catch { setPhotoSets([]); } finally { setPhotosLoading(false); }

      // Listar InBody (via API server-side, sem depender de Storage Rules no cliente)
      try {
        const { getAuth } = await import("firebase/auth");
        const token = getAuth().currentUser ? await getAuth().currentUser!.getIdToken() : "";
        const res = await fetch(`/api/storage/inbody?uid=${encodeURIComponent(uid)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        let items: Array<{ id: string; url: string; createdAt: Date | null }> = [];
        if (res.ok) {
          const data = await res.json();
          const arr: Array<{ url: string; name: string; contentType: string; createdAt?: string | null }> = Array.isArray(data.items) ? data.items : [];
          items = arr.map((x)=>({ id: x.name, url: x.url, createdAt: x.createdAt ? new Date(x.createdAt) : null }));
        }
        items.sort((a,b)=>((b.createdAt?.getTime()||0)-(a.createdAt?.getTime()||0)) || b.id.localeCompare(a.id));
        setInbodyFiles(items);
      } catch {
        setInbodyFiles([]);
      } finally {
        setInbodyLoading(false);
      }

      // Ler consentimento de fotos do utilizador
      try {
        const s = await getDoc(doc(db, "users", uid));
        const d: any = s.data() || {};
        setPhotoConsentActive(typeof d.photoConsentActive === 'boolean' ? d.photoConsentActive : null);
        const ts = d.photoConsentUpdatedAt?.toDate ? d.photoConsentUpdatedAt.toDate() : (d.photoConsentUpdatedAt ? new Date(d.photoConsentUpdatedAt) : null);
        setPhotoConsentAt(ts || null);
      } catch {}

      await loadPlAll(uid);

      setLoading(false);
    })();
  }, [uid]);

  // Powerlifting: realtime subscription to keep table always updated
  useEffect(() => {
    if (!uid) return;
    try {
      const base = collection(db, "users", uid, "powerlifting");
      const unsub = onSnapshot(base, (qs) => {
        const result: Record<PLExercise, PR[]> = { agachamento: [], supino: [], levantamento: [] };
        qs.docs.forEach((d) => {
          const obj: any = d.data();
          const ex = (obj.exercise as PLExercise) || null;
          if (!ex || !(ex === "agachamento" || ex === "supino" || ex === "levantamento")) return;
          const rec: PR = {
            id: d.id,
            exercise: ex,
            weight: Number(obj.weight) || 0,
            reps: Math.max(1, Math.floor(Number(obj.reps) || 1)),
            createdAt: obj.createdAt?.toDate ? obj.createdAt.toDate() : null,
          };
          result[ex].push(rec);
        });
        (Object.keys(result) as PLExercise[]).forEach((e) => {
          result[e].sort(
            (a, b) => epley1RM(b.weight, b.reps) - epley1RM(a.weight, a.reps) || b.weight - a.weight || b.reps - a.reps
          );
        });
        setPlPrs(result);
      });
      return () => unsub();
    } catch {
      // ignore
    }
  }, [uid]);

  async function saveCoachNote(checkinId: string) {
    const text = (noteById[checkinId] ?? "").trim();
    setSavingNoteId(checkinId);
    try {
      const noteRef = doc(db, `users/${uid}/checkins/${checkinId}/coachNotes/default`);
      const snap = await getDoc(noteRef);
      if (snap.exists()) {
        await updateDoc(noteRef, {
          privateComment: text,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(noteRef, {
          privateComment: text,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("save note error", e);
    } finally {
      setSavingNoteId(null);
    }
  }

  const novoCheckinHref = `/checkin?clientId=${uid}`;
  const editarUltimoHref = checkins[0]?.id ? `/checkin?clientId=${uid}&checkinId=${checkins[0].id}` : "";

  async function handlePlanUpload(kind: "training" | "diet", file: File) {
    try {
      if (!storage) throw new Error("Storage indisponível. Configura as envs NEXT_PUBLIC_FIREBASE_*");
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) throw new Error("Apenas PDFs são permitidos.");
      if (file.size > 20 * 1024 * 1024) throw new Error("Ficheiro demasiado grande (máx. 20MB).");

      if (kind === "training") { setUploadingTraining(true); setTrainingError(null); }
      else { setUploadingDiet(true); setDietError(null); }

      const path = `plans/${uid}/${kind}.pdf`;
      const r = ref(storage, path);
      const task = uploadBytesResumable(r, file, { contentType: "application/pdf" });
      let progressed = false;
      const timer = setTimeout(async () => {
        if (!progressed) { try { task.cancel(); } catch {} }
      }, 5000);
      task.on("state_changed", (snap) => {
        const pct = Math.round((snap.bytesTransferred / Math.max(1, snap.totalBytes)) * 100);
        if (pct > 0) progressed = true;
        if (kind === "training") setTrainingProgress(pct); else setDietProgress(pct);
      }, async () => {}, async () => {});
      let url: string | null = null;
      try {
        await task;
        url = await getDownloadURL(r);
      } catch (e) {
        try {
          if (!progressed) {
            await uploadBytes(r, file, { contentType: "application/pdf" });
            url = await getDownloadURL(r);
          } else {
            throw e;
          }
        } catch (e2) {
          // Final fallback: upload via server to bypass CORS
          try {
            const token = (await import("firebase/auth")).getAuth()?.currentUser ? await (await import("firebase/auth")).getAuth().currentUser!.getIdToken() : "";
            const fd = new FormData();
            fd.append("kind", kind);
            fd.append("uid", uid);
            fd.append("file", file);
            const res = await fetch("/api/storage/plans", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            url = data.url || null;
            if (!url) throw new Error("no_url");
          } catch (e3) {
            throw e3;
          }
        }
      } finally {
        clearTimeout(timer);
      }
      if (!url) throw new Error("Falha no upload (sem URL)");
      const payload: any = { updatedAt: serverTimestamp() };
      if (kind === "training") { payload.trainingUrl = url; payload.trainingUpdatedAt = serverTimestamp(); }
      else { payload.dietUrl = url; payload.dietUpdatedAt = serverTimestamp(); }
      await setDoc(doc(db, "users", uid, "plans", "latest"), payload, { merge: true });
      try {
        const title = "Planos atualizados";
        const message = kind === "training" ? "Novo plano de treino disponível" : "Nova sugestão alimentar disponível";
        await addDoc(collection(db, "users", uid, "coachNotifications"), {
          kind: "planos_atualizados",
          type: kind,
          title,
          message,
          createdAt: serverTimestamp(),
          read: false,
        });
      } catch (e) {
        console.warn("Falha ao registar notificação de planos:", e);
      }
      try { await pushPlanosAnexados(uid); } catch (e) { console.warn("Falha push planos:", e); }
      if (kind === "training") { setTrainingUrl(url); setTrainingAt(new Date()); } else { setDietUrl(url); setDietAt(new Date()); }
    } catch (e: any) {
      const msg = e?.message || "Falha no upload.";
      if (kind === "training") setTrainingError(msg); else setDietError(msg);
      console.error("Upload plano falhou", e);
    } finally {
      if (kind === "training") { setUploadingTraining(false); setTrainingProgress(null); }
      else { setUploadingDiet(false); setDietProgress(null); }
    }
  }


  return (
    <CoachGuard>
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold truncate">{name}</h1>
            <div className="text-sm text-muted-foreground truncate">{email}</div>
            <div className="flex flex-wrap gap-2 mt-2 text-sm">
              <Badge variant="outline">Último CI: {lastCheckinYMD ?? "—"}</Badge>
              <Badge variant={nextDue ? "destructive" : "outline"}>
                {nextDue && <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
                Próximo CI: {nextCheckinYMD ?? "—"}
              </Badge>
              <Badge variant="secondary">Meta água: {metaAgua != null ? `${metaAgua} L` : "—"} ({metaSource})</Badge>
              {workoutFrequency != null && (
                <Badge variant="secondary">Treinos/semana: {workoutFrequency}</Badge>
              )}
              <Badge variant={imgConsent ? "secondary" : "destructive"}>
                Consent. fotos: {imgConsent ? "Sim" : "Não"}{imgConsentAt ? ` • ${ymd(imgConsentAt)}` : ""}
              </Badge>
              {nextDue && phone && (
                <a
                  href={`https://wa.me/${(phone || '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(`Olá ${name.split(' ')[0] || ''}! Está na hora do teu check-in. Consegues marcar a avaliação?`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                  title="Enviar WhatsApp"
                >
                  <span>WhatsApp</span>
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 w-full sm:w-auto sm:items-end">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={async (e) => {
                    const val = e.currentTarget.checked;
                    setActive(val);
                    setSavingActive(true);
                    try {
                      await updateDoc(doc(db, "users", uid), { active: val, updatedAt: serverTimestamp() });
                    } catch (err) {
                      setActive(!val);
                      console.error("toggle active error", err);
                    } finally {
                      setSavingActive(false);
                    }
                  }}
                />
                <span>{savingActive ? "A atualizar…" : "Conta ativa"}</span>
              </label>


              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={plEnabled}
                  onChange={async (e) => {
                    const enabled = e.currentTarget.checked;
                    setPlEnabled(enabled);
                    try {
                      await updateDoc(doc(db, "users", uid), { powerlifting: enabled, updatedAt: serverTimestamp() });
                    } catch {
                      setPlEnabled(!enabled);
                    }
                  }}
                />
                <span>Powerlifting</span>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full">
              {editarUltimoHref && (
                <Link href={editarUltimoHref} className="w-full sm:w-auto">
                  <Button variant="secondary" className="w-full sm:w-auto">Editar último check-in</Button>
                </Link>
              )}
              <Link href={novoCheckinHref} className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto">Novo check-in</Button>
              </Link>
              <Button asChild variant="ghost" size="sm" className="w-full sm:w-auto">
                <Link href="/coach"><ArrowLeft className="h-4 w-4" />Voltar</Link>
              </Button>
            </div>
          </div>
        </div>


        {/* Selector for sections */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Button size="sm" variant={visibleSection === "daily" ? "default" : "outline"} onClick={() => setVisibleSection("daily")}>Diários</Button>
          <Button size="sm" variant={visibleSection === "weekly" ? "default" : "outline"} onClick={() => setVisibleSection("weekly")}>Semanais</Button>
          <Button size="sm" variant={visibleSection === "evolucao" ? "default" : "outline"} onClick={() => setVisibleSection("evolucao")}>Evolução</Button>
          <Button size="sm" variant={visibleSection === "calendario" ? "default" : "outline"} onClick={() => setVisibleSection("calendario")}>Calendário</Button>
          <Button size="sm" variant={visibleSection === "planos" ? "default" : "outline"} onClick={() => setVisibleSection("planos")}>Planos</Button>
          <Button size="sm" variant={visibleSection === "fotos" ? "default" : "outline"} onClick={() => setVisibleSection("fotos")}>Fotos</Button>
          <Button size="sm" variant={visibleSection === "inbody" ? "default" : "outline"} onClick={() => setVisibleSection("inbody")}>InBody</Button>
          <Button size="sm" variant={visibleSection === "onboarding" ? "default" : "outline"} onClick={() => setVisibleSection("onboarding")}>Onboarding</Button>
          <Button size="sm" variant={visibleSection === "notificacoes" ? "default" : "outline"} onClick={() => setVisibleSection("notificacoes")}>Notificações</Button>
          <Button size="sm" variant={visibleSection === "checkins" ? "default" : "outline"} onClick={() => setVisibleSection("checkins")}>Check-ins</Button>
          <Button size="sm" variant={visibleSection === "powerlifting" ? "default" : "outline"} onClick={() => setVisibleSection("powerlifting")}>Powerlifting</Button>
        </div>

        {/* Dailies */}
        <Card className={"shadow-sm " + (visibleSection !== "daily" ? "hidden" : "")}>
          <CardHeader>
            <CardTitle>Últimos 7 dailies</CardTitle>
          </CardHeader>
          <CardContent>
            {dailies.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem registos.</div>
            ) : (
              <>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">Data</th>
                        <th className="py-2 pr-4">Peso (kg)</th>
                        <th className="py-2 pr-4">Água (L)</th>
                        <th className="py-2 pr-4">Passos</th>
                        <th className="py-2 pr-4">Treino</th>
                        <th className="py-2 pr-4">Alim. 100%</th>
                        <th className="py-2 pr-4">Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailies.map((d) => {
                        const w = num(d.weight) ?? num(d.peso);
                        const agua = num(d.waterLiters) ?? num(d.aguaLitros);
                        return (
                          <tr key={d.id} className="border-t">
                            <td className="py-2 pr-4">{ymd(toDate(d.date ?? null))}</td>
                            <td className="py-2 pr-4">{w != null ? w : "—"}</td>
                            <td className="py-2 pr-4">
                              {agua != null ? agua : "—"}
                              {num(d.metaAgua) != null && ` / ${d.metaAgua}`}
                            </td>
                            <td className="py-2 pr-4">{num(d.steps) ?? num(d.passos) ?? "—"}</td>
                            <td className="py-2 pr-4">{(d.didWorkout ?? d.treinou) ? "Sim" : "—"}</td>
                            <td className="py-2 pr-4">{d.alimentacao100 ? "Sim" : "—"}</td>
                            <td className="py-2 pr-4 break-words">{d.notes ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="sm:hidden space-y-2">
                  {dailies.map((d) => {
                    const w = num(d.weight) ?? num(d.peso);
                    const agua = num(d.waterLiters) ?? num(d.aguaLitros);
                    return (
                      <div key={d.id} className="rounded-xl border p-3 text-sm">
                        <div className="font-medium mb-1">{ymd(toDate(d.date ?? null))}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><span className="text-muted-foreground">Peso:</span> {w != null ? w : "—"}</div>
                          <div><span className="text-muted-foreground">Água:</span> {agua != null ? agua : "—"}{num(d.metaAgua) != null && ` / ${d.metaAgua}`}</div>
                          <div><span className="text-muted-foreground">Passos:</span> {num(d.steps) ?? num(d.passos) ?? "—"}</div>
                          <div><span className="text-muted-foreground">Treino:</span> {(d.didWorkout ?? d.treinou) ? "Sim" : "—"}</div>
                          <div><span className="text-muted-foreground">Alim.:</span> {d.alimentacao100 ? "Sim" : "—"}</div>
                          {d.notes ? (
                            <div className="col-span-2 break-words"><span className="text-muted-foreground">Notas:</span> {d.notes}</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>


        {/* Evolução */}
        <Card className={"shadow-sm " + (visibleSection !== "evolucao" ? "hidden" : "")}>
          <CardHeader>
            <CardTitle>Evolução</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border p-4 bg-background">
              <SwitchableEvolution data={evoData} />
            </div>
            <div className="text-xs text-muted-foreground mt-2">Podes deslizar para ver outros gráficos.</div>
          </CardContent>
        </Card>

        {/* Calendário */}
        <Card className={"shadow-sm " + (visibleSection !== "calendario" ? "hidden" : "") }>
          <CardHeader>
            <CardTitle>Calendário</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border p-4 bg-background max-w-md">
              <SwitchableCalendar uid={uid} />
            </div>
          </CardContent>
        </Card>

        {/* Onboarding */}
        <Card className={"shadow-sm " + (visibleSection !== "onboarding" ? "hidden" : "")}>
          <CardHeader>
            <CardTitle>Onboarding (Questionário)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            {!onboarding ? (
              <div className="text-muted-foreground">Sem questionário preenchido.</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {Object.entries({
                  "Nome": onboarding.fullName,
                  "Idade": onboarding.age,
                  "Altura (cm)": onboarding.heightCm,
                  "Peso (kg)": onboarding.weightKg ?? onboarding.weight,
                  "Profissão": onboarding.occupation,
                  "Objetivo": onboarding.goal,
                  "Atividade extra": onboarding.doesOtherActivity === true ? "Sim" : onboarding.doesOtherActivity === false ? "Não" : onboarding.doesOtherActivity,
                  "Detalhes atividade": onboarding.otherActivityDetails,
                  "Treinos/semana": onboarding.workoutFrequency,
                  "Lesão": onboarding.hasInjury === true ? "Sim" : onboarding.hasInjury === false ? "Não" : onboarding.hasInjury,
                  "Local lesão": onboarding.injuryDetails,
                  "Mobilidade": onboarding.mobilityIssues === true ? "Sim" : onboarding.mobilityIssues === false ? "Não" : onboarding.mobilityIssues,
                  "Detalhes mobilidade": onboarding.mobilityDetails,
                  "Dores": onboarding.hasPain === true ? "Sim" : onboarding.hasPain === false ? "Não" : onboarding.hasPain,
                  "Local da dor": onboarding.painLocation,
                  "Dificuldade na dieta": onboarding.dietDifficulty,
                  "Medicação": onboarding.takesMedication === true ? "Sim" : onboarding.takesMedication === false ? "Não" : onboarding.takesMedication,
                  "Qual medicação": onboarding.medication,
                  "Problema intestinal": onboarding.intestinalIssues === true ? "Sim" : onboarding.intestinalIssues === false ? "Não" : onboarding.intestinalIssues,
                  "Detalhes intestinais": onboarding.intestinalDetails,
                  "Doença diagnosticada": onboarding.hasDiagnosedDisease === true ? "Sim" : onboarding.hasDiagnosedDisease === false ? "Não" : onboarding.hasDiagnosedDisease,
                  "Qual doença": onboarding.diagnosedDisease,
                  "Alergia a alimentos": onboarding.hasFoodAllergy === true ? "Sim" : onboarding.hasFoodAllergy === false ? "Não" : onboarding.hasFoodAllergy,
                  "Qual alergia": onboarding.foodAllergy,
                  "Alimentos que não gosta": onboarding.foodsDisliked,
                  "Alimentos preferidos": onboarding.foodsLiked,
                  "Suplementos": onboarding.takesSupplements === true ? "Sim" : onboarding.takesSupplements === false ? "Não" : onboarding.takesSupplements,
                  "Quais suplementos": onboarding.supplements,
                  "Água (L/dia)": onboarding.waterLitersPerDay,
                  "Qualidade do sono": onboarding.sleepQuality,
                  "Horas de sono": onboarding.sleepHours,
                  "Álcool": onboarding.drinksAlcohol === true ? "Sim" : onboarding.drinksAlcohol === false ? "Não" : onboarding.drinksAlcohol,
                  "Frequência álcool": onboarding.alcoholFrequency,
                  "Rotina de refeições": onboarding.mealRoutine,
                  "Outras observações": onboarding.otherNotes,
                }).map(([k, v]) => (
                  v == null || v === "" ? null : (
                    <div key={k} className="rounded-xl border p-3 bg-background">
                      <div className="text-xs text-muted-foreground">{k}</div>
                      <div className="font-medium break-words whitespace-pre-wrap">{String(v)}</div>
                    </div>
                  )
                ))}
              </div>
            )}

          </CardContent>
        </Card>

        {/* Notificações */}
        <Card className={"shadow-sm " + (visibleSection !== "notificacoes" ? "hidden" : "") }>
          <CardHeader>
            <CardTitle>Notificações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium mb-2">Notificações rápidas</div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "pagamento_atrasado", label: "Pagamento Atrasado" },
                { key: "marcar_checkin", label: "Marcar Check-In" },
                { key: "faltas_diarios", label: "Falta de Registo Diários" },
                { key: "faltas_semanal", label: "Falta de Registo Semanal" },
                { key: "enviar_fotos", label: "Pedir fotos de atualização" },
                { key: "beber_agua", label: "Bebe mais água!" },
              ].map((b) => (
                <Button
                  key={b.key}
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      if (b.key === "pagamento_atrasado") await pushPagamento(uid);
                      else if (b.key === "marcar_checkin") await pushMarcarCheckin(uid);
                      else if (b.key === "faltas_diarios") await pushRegistosDiarios(uid);
                      else if (b.key === "faltas_semanal") await pushRegistoSemanal(uid);
                      else if (b.key === "enviar_fotos") await pushFotos(uid);
                      else if (b.key === "beber_agua") await pushHidratacao(uid);
                    } catch (e) { console.error(e); }
                  }}
                >
                  {b.label}
                </Button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Cria registos em users/{uid}/coachNotifications e notificationsQueue para envio via OneSignal.</div>
          </CardContent>
        </Card>

        {/* Weekly */}
        <Card className={"shadow-sm " + (visibleSection !== "weekly" ? "hidden" : "")}>
          <CardHeader>
            <CardTitle>Weekly (último)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {weekly ? (
              <div className="space-y-1">
                <div className="text-muted-foreground">Semana até: {ymd(toDate(weekly.weekEndDate || null))}</div>
                {weekly.howWasTheWeek && <div><span className="font-medium">Resumo: </span>{weekly.howWasTheWeek}</div>}
                {weekly.energyLevels && <div><span className="font-medium">Energia: </span>{weekly.energyLevels}</div>}
                {weekly.sleepQuality && <div><span className="font-medium">Sono: </span>{weekly.sleepQuality}</div>}
                {weekly.stressLevels && <div><span className="font-medium">Stress: </span>{weekly.stressLevels}</div>}
                {weekly.dietChallenges && <div><span className="font-medium">Dieta: </span>{weekly.dietChallenges}</div>}
                {weekly.workoutChallenges && <div><span className="font-medium">Treinos: </span>{weekly.workoutChallenges}</div>}
              </div>
            ) : (
              <div className="text-muted-foreground">Sem weekly registado.</div>
            )}
          </CardContent>
        </Card>

        {/* Powerlifting (vazio por agora) */}
        <Card className={"shadow-sm " + (visibleSection !== "powerlifting" ? "hidden" : "")}>
          <CardHeader>
            <CardTitle>Powerlifting</CardTitle>
          </CardHeader>
          <CardContent>
            {!plEnabled ? (
              <div className="text-sm text-muted-foreground">Powerlifting desativado para este cliente.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(["agachamento", "supino", "levantamento"] as PLExercise[]).map((e) => {
                      const best1 = [...plPrs[e]].filter(p => p.reps === 1).sort((a,b)=> b.weight - a.weight)[0] || null;
                      const label = e === "agachamento" ? "Agachamento" : e === "supino" ? "Supino" : "Levantamento Terra";
                      return (
                        <div key={e} className="rounded-2xl border p-4 bg-background">
                          <div className="text-sm font-medium mb-1">{label}</div>
                          {best1 ? (
                            <div className="text-sm text-slate-700">
                              Melhor (1RM): <span className="font-semibold">{best1.weight} kg × {best1.reps}</span>
                              <div className="text-xs text-slate-500 mt-1">1RM Estimada (Epley): {epley1RM(best1.weight, best1.reps)} kg</div>
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">Sem 1RM registado</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  {(["agachamento", "supino", "levantamento"] as PLExercise[]).map((e) => {
                    const label = e === "agachamento" ? "Agachamento" : e === "supino" ? "Supino" : "Levantamento Terra";
                    const list = [...plPrs[e]].sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
                    const visible = list.slice(0, plShowCount[e]);
                    return (
                      <div key={e} className="rounded-2xl border p-4 bg-background">
                        <div className="text-sm font-medium mb-2">{label} — Histórico</div>
                        {list.length === 0 ? (
                          <div className="text-sm text-muted-foreground">Sem registos.</div>
                        ) : (
                          <div className="space-y-3">
                            <div className="hidden sm:block overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="text-left text-muted-foreground">
                                  <tr>
                                    <th className="py-2 pr-4">Data</th>
                                    <th className="py-2 pr-4">Peso</th>
                                    <th className="py-2 pr-4">Reps</th>
                                    <th className="py-2 pr-4">1RM Estimada (Epley)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {visible.map((p) => (
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

                            <div className="sm:hidden space-y-2">
                              {visible.map((p) => (
                                <div key={p.id} className="rounded-xl border p-3 text-sm">
                                  <div className="font-medium mb-1">{p.createdAt ? p.createdAt.toLocaleDateString("pt-PT") : "—"}</div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div><span className="text-muted-foreground">Peso:</span> {p.weight} kg</div>
                                    <div><span className="text-muted-foreground">Reps:</span> {p.reps}</div>
                                    <div className="col-span-2"><span className="text-muted-foreground">1RM Est.:</span> {epley1RM(p.weight, p.reps)} kg</div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {list.length > plShowCount[e] && (
                              <div className="flex justify-center">
                                <Button size="sm" variant="outline" onClick={() => setPlShowCount((s)=>({ ...s, [e]: s[e] + 10 }))}>Ver mais…</Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Planos (PDFs) */}
        <Card className={"shadow-sm " + (visibleSection !== "planos" ? "hidden" : "")}>
          <CardHeader>
            <CardTitle>Planos (PDF)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {plansLoading ? (
              <div className="text-muted-foreground">A carregar…</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border p-4 bg-background">
                  <div className="flex items-center gap-2 font-medium mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>Plano de Treino</span>
                  </div>
                  {trainingUrl ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={()=>setPreview({ url: trainingUrl!, kind: "pdf" })}>Ver</Button>
                        <Button asChild size="sm" variant="outline">
                          <a href={trainingUrl} download>Download</a>
                        </Button>
                      </div>
                      {trainingAt && (
                        <div className="text-xs text-muted-foreground">Atualizado: {ymd(trainingAt)}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-muted-foreground italic">Sem plano.</div>
                  )}
                  <div className="mt-3 flex flex-col items-start gap-2">
                    <input
                      ref={trainingInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden" aria-hidden="true"
                      onChange={(e)=>{const f=e.currentTarget.files?.[0]; if(f){ setTrainingSelected(f.name); handlePlanUpload("training", f); e.currentTarget.value = ""; }}}
                    />
                    <Button size="sm" onClick={() => trainingInputRef.current?.click()} disabled={uploadingTraining}>
                      <Upload className="h-4 w-4" />
                      {uploadingTraining ? "A enviar…" : "Escolher ficheiro"}
                    </Button>
                    {typeof trainingProgress === "number" && (
                      <div className="w-full max-w-xs mt-2">
                        <div className="h-2 rounded bg-slate-200 overflow-hidden">
                          <div className="h-full bg-blue-600 transition-all" style={{ width: `${trainingProgress}%` }} />
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1">{trainingProgress}%</div>
                      </div>
                    )}
                    {trainingError ? (
                      <div className="text-xs text-red-600 text-left">{trainingError}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground leading-relaxed text-left max-w-full truncate">{trainingSelected ?? "Nenhum ficheiro selecionado"}</div>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border p-4 bg-background">
                  <div className="flex items-center gap-2 font-medium mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>Sugestão Alimentar</span>
                  </div>
                  {dietUrl ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={()=>setPreview({ url: dietUrl!, kind: "pdf" })}>Ver</Button>
                        <Button asChild size="sm" variant="outline">
                          <a href={dietUrl} download>Download</a>
                        </Button>
                      </div>
                      {dietAt && (
                        <div className="text-xs text-muted-foreground">Atualizado: {ymd(dietAt)}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-muted-foreground italic">Sem plano.</div>
                  )}
                  <div className="mt-3 flex flex-col items-start gap-2">
                    <input
                      ref={dietInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden" aria-hidden="true"
                      onChange={(e)=>{const f=e.currentTarget.files?.[0]; if(f){ setDietSelected(f.name); handlePlanUpload("diet", f); e.currentTarget.value = ""; }}}
                    />
                    <Button size="sm" onClick={() => dietInputRef.current?.click()} disabled={uploadingDiet}>
                      <Upload className="h-4 w-4" />
                      {uploadingDiet ? "A enviar…" : "Escolher ficheiro"}
                    </Button>
                    {typeof dietProgress === "number" && (
                      <div className="w-full max-w-xs mt-2">
                        <div className="h-2 rounded bg-slate-200 overflow-hidden">
                          <div className="h-full bg-blue-600 transition-all" style={{ width: `${dietProgress}%` }} />
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1">{dietProgress}%</div>
                      </div>
                    )}
                    {dietError ? (
                      <div className="text-xs text-red-600 text-left">{dietError}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground leading-relaxed text-left max-w-full truncate">{dietSelected ?? "Nenhum ficheiro selecionado"}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {preview && (
          <ZoomViewer url={preview.url} kind={preview.kind} onClose={()=>setPreview(null)} />
        )}


        {/* Fotos (progresso) */}
        <Card className={"shadow-sm " + (visibleSection !== "fotos" ? "hidden" : "")}>
          <CardHeader>
            <CardTitle>Fotos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border p-4 bg-background mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">Permissão para uso de fotos</div>
                <div className="text-sm font-medium">
                  {photoConsentActive === null ? "—" : photoConsentActive ? "Ativo" : "Inativo"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {photoConsentAt ? `Atualizado em ${photoConsentAt.toLocaleString()}` : "Sem registo"}
              </div>
            </div>

            {photosLoading ? (
              <div className="text-sm text-muted-foreground">A carregar…</div>
            ) : groupsByDay.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem fotos.</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border p-4 bg-background">
                    <div className="text-sm text-slate-700 mb-2">Início</div>
                    {(function(){ const oldest = groupsByDay[groupsByDay.length-1]; const cover = oldest?.urls?.[0]; return (
                      <button className="w-full text-left" onClick={()=> oldest && setOpenDay(oldest)}>
                        <div className="relative w-full h-48 bg-muted rounded-xl overflow-hidden">
                          {cover ? <img src={cover} alt="Inicio" className="absolute inset-0 w-full h-full object-contain" /> : <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Sem capa</div>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{oldest ? new Date(oldest.date+"T00:00:00").toLocaleDateString() : "—"}</div>
                      </button>
                    ); })()}
                  </div>
                  <div className="rounded-2xl border p-4 bg-background">
                    <div className="text-sm text-slate-700 mb-2">Atual</div>
                    {(function(){ const newest = groupsByDay[0]; const cover = newest?.urls?.[0]; return (
                      <button className="w-full text-left" onClick={()=> newest && setOpenDay(newest)}>
                        <div className="relative w-full h-48 bg-muted rounded-xl overflow-hidden">
                          {cover ? <img src={cover} alt="Atual" className="absolute inset-0 w-full h-full object-contain" /> : <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Sem capa</div>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{newest ? new Date(newest.date+"T00:00:00").toLocaleDateString() : "—"}</div>
                      </button>
                    ); })()}
                  </div>
                </div>

                <div className="text-sm font-medium">Histórico</div>
                <div className="grid grid-cols-1 gap-3">
                  {groupsByDay.map((g)=> (
                    <div key={g.date} className="rounded-2xl border p-4 bg-background flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{new Date(g.date+"T00:00:00").toLocaleDateString()}</div>
                        <div className="text-xs text-muted-foreground">{g.urls.length} imagem(s)</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={()=>setOpenDay(g)}>Ver</Button>
                        <Button size="sm" variant="outline" onClick={async ()=>{ await downloadAll(g.urls, `fotos-${g.date}`); }}>Download</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {openDay && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col">
            <div className="relative m-4 md:m-10 bg-white rounded-xl shadow-xl overflow-auto p-4">
              <div className="sticky top-2 right-2 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={async ()=>{ await downloadAll(openDay.urls, `fotos-${openDay.date}`); }}>Download todas</Button>
                <Button size="sm" variant="secondary" onClick={()=>setOpenDay(null)}>Fechar</Button>
              </div>
              <div className="mb-2 font-medium">{new Date(openDay.date+"T00:00:00").toLocaleDateString()}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {openDay.urls.map((u, i)=> (
                  <div key={i} className="relative">
                    <img src={u} alt={`Foto ${i+1}`} className="w-full rounded-xl object-contain" />
                    <div className="mt-2 flex justify-center">
                      <Button size="sm" variant="outline" onClick={()=>downloadUrl(u, `fotos-${openDay.date}-${String(i+1).padStart(2,'0')}.jpg`)}>Download</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* InBody (imagens) */}
        <Card className={"shadow-sm " + (visibleSection !== "inbody" ? "hidden" : "")}>
          <CardHeader>
            <CardTitle>InBody</CardTitle>
          </CardHeader>
          <CardContent>
            {inbodyLoading ? (
              <div className="text-sm text-muted-foreground">A carregar…</div>
            ) : inbodyFiles.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem anexos.</div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {inbodyFiles.map((f) => (
                  <div key={f.id} className="rounded-2xl border p-4 bg-background flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">InBody</div>
                      <div className="text-xs text-muted-foreground">{f.createdAt ? f.createdAt.toLocaleString() : "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={()=>setPreview({ url: f.url, kind: (/\.pdf($|\?)/i.test(f.url)) ? "pdf" : "image" })}>Ver</Button>
                      <Button asChild size="sm" variant="outline"><a href={f.url} target="_blank" rel="noopener noreferrer">Abrir</a></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Check-ins */}
        <Card className={"shadow-sm " + (visibleSection !== "checkins" ? "hidden" : "")}>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Check-ins
              {/* usar title no wrapper para evitar passar props desconhecidos ao <Info /> */}
              <span
                className="inline-flex"
                title={
                  "Legenda das setas:\n" +
                  "• Peso: seta preta (↑ subiu, ↓ desceu).\n" +
                  "• Massa muscular: ↑ verde (bom), ↓ vermelho.\n" +
                  "• Massa gorda: ↑ vermelho, ↓ verde (bom)."
                }
              >
                <Info className="h-4 w-4 text-muted-foreground" />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {checkins.length === 0 && (
              <div className="text-sm text-muted-foreground">Sem check-ins.</div>
            )}
            {checkins.map((c, idx) => {
              const prev = checkins[idx + 1];

              const w = num(c.weight) ?? num(c.peso);
              const mm = num(c.massaMuscular);
              const mg = num(c.massaGorda);

              const prevW = prev ? (num(prev.weight) ?? num(prev.peso)) : null;
              const prevMM = prev ? num(prev.massaMuscular) : null;
              const prevMG = prev ? num(prev.massaGorda) : null;

              const dW = w != null && prevW != null ? +(w - prevW).toFixed(1) : null;
              const dMM = mm != null && prevMM != null ? +(mm - prevMM).toFixed(1) : null;
              const dMG = mg != null && prevMG != null ? +(mg - prevMG).toFixed(1) : null;

              return (
                <div key={c.id} className="rounded-2xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm">
                      <div className="font-medium">Data: {ymd(toDate(c.date ?? null))}</div>
                      <div className="text-muted-foreground">
                        Próxima: {ymd(toDate(c.nextDate ?? null))} • Tipo: {c.type ?? "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/checkin?clientId=${uid}&checkinId=${c.id}`}>
                        <Button size="sm" variant="outline">Editar</Button>
                      </Link>
                    </div>
                  </div>

                  <Separator className="my-2" />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <K label="Peso (kg)" v={w}    delta={dW}  kind="peso" />
                    <K label="M. Muscular" v={mm} delta={dMM} kind="mm" />
                    <K label="M. Gorda"    v={mg} delta={dMG} kind="mg" />
                    <K label="Meta água (L)" v={num(c.metaAgua)} />
                  </div>

                  {c.commentPublic && (
                    <div className="mt-2 text-sm">
                      <span className="font-medium">Comentário público: </span>{c.commentPublic}
                    </div>
                  )}

                  {/* Nota privada do coach */}
                  <div className="mt-3 text-sm">
                    <div className="mb-1 font-medium">Nota privada</div>
                    <Textarea
                      value={noteById[c.id] ?? ""}
                      onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                        setNoteById((prev) => ({ ...prev, [c.id]: e.currentTarget.value }))
                      }
                      placeholder="Só o coach vê isto…"
                      className="min-h-[80px]"
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveCoachNote(c.id)}
                        disabled={savingNoteId === c.id}
                      >
                        {savingNoteId === c.id ? "A guardar…" : "Guardar nota"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </main>
    </CoachGuard>
  );
}

/* KPI card com setas/deltas + valor numérico */
function K({
  label,
  v,
  delta,
  kind,
}: {
  label: string;
  v: number | null;
  delta?: number | null;
  kind?: "peso" | "mm" | "mg";
}) {
  const arrow = (() => {
    if (delta == null) return null;
    if (delta > 0) return "↑";
    if (delta < 0) return "↓";
    return "→";
  })();

  const arrowClass = (() => {
    if (delta == null) return "text-muted-foreground";
    if (kind === "peso") return "text-slate-900"; // sempre preto
    if (kind === "mm") return delta > 0 ? "text-green-600" : delta < 0 ? "text-rose-600" : "text-muted-foreground";
    if (kind === "mg") return delta > 0 ? "text-rose-600" : delta < 0 ? "text-green-600" : "text-muted-foreground";
    return "text-muted-foreground";
  })();

  const deltaTxt = delta == null ? null : `${arrow} ${Math.abs(delta).toFixed(1)}`;

  return (
    <div className="rounded-xl border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold flex items-center gap-2">
        <span>{v != null ? v : "—"}</span>
        {deltaTxt && <span className={arrowClass} title={deltaTxt}>{deltaTxt}</span>}
      </div>
    </div>
  );
}
