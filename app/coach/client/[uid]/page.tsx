"use client";

"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import CoachGuard from "@/components/ui/CoachGuard";
import { ref, uploadBytes, getDownloadURL, listAll, getMetadata } from "firebase/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lisbonYMD, lisbonTodayYMD } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Info, Upload, FileText, X, ArrowLeft } from "lucide-react";
import SwitchableEvolution, { type EvolutionData } from "@/components/SwitchableEvolution";

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

  // Hydration target
  const [metaAgua, setMetaAgua] = useState<number | null>(null);
  const [metaSource, setMetaSource] =
    useState<"daily" | "checkin" | "questionnaire" | "default">("default");

  // Questionnaire extra
  const [workoutFrequency, setWorkoutFrequency] = useState<number | null>(null);

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


  // Powerlifting flag
  const [plEnabled, setPlEnabled] = useState<boolean>(false);
  const [imgConsent, setImgConsent] = useState<boolean>(false);
  const [imgConsentAt, setImgConsentAt] = useState<Date | null>(null);
  const [coachOverride, setCoachOverride] = useState<boolean>(false);

  const [visibleSection, setVisibleSection] = useState<"daily" | "weekly" | "planos" | "fotos" | "inbody" | "checkins" | "powerlifting" | "evolucao">("daily");

  const [plPrs, setPlPrs] = useState<Record<PLExercise, PR[]>>({ agachamento: [], supino: [], levantamento: [] });
  const [plShowCount, setPlShowCount] = useState<Record<PLExercise, number>>({ agachamento: 10, supino: 10, levantamento: 10 });

  async function loadPlAll(userId: string) {
    try {
      const base = collection(db, "users", userId, "powerlifting");
      const ex: PLExercise[] = ["agachamento", "supino", "levantamento"];
      const result: Record<PLExercise, PR[]> = { agachamento: [], supino: [], levantamento: [] };
      for (const e of ex) {
        const qs = await getDocs(query(base, where("exercise", "==", e)));
        result[e] = qs.docs
          .map((d) => {
            const obj: any = d.data();
            return {
              id: d.id,
              exercise: obj.exercise,
              weight: obj.weight,
              reps: obj.reps,
              createdAt: obj.createdAt?.toDate ? obj.createdAt.toDate() : null,
            } as PR;
          })
          .sort(
            (a, b) =>
              epley1RM(b.weight, b.reps) - epley1RM(a.weight, a.reps) || b.weight - a.weight || b.reps - a.reps
          );
      }
      setPlPrs(result);
    } catch {}
  }

  // Evolução (gráficos)
  const [evoData, setEvoData] = useState<EvolutionData>({ pesoSemanal: [], pesoCheckin: [], massaMuscular: [], massaGorda: [], gorduraVisceral: [] });

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
      setActive(typeof u.active === "boolean" ? u.active : true);
      setPlEnabled(!!u.powerlifting);
      setImgConsent(!!u.imageUseConsent);
      setImgConsentAt(toDate(u.imageUseConsentAt ?? null));
      setCoachOverride(!!u.imageUploadAllowedByCoach);

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
          query(collection(db, `users/${uid}/questionnaire`), orderBy("createdAt", "desc"), limit(1))
        );
        if (qSnap.empty) {
          qSnap = await getDocs(
            query(collection(db, `users/${uid}/questionnaire`), orderBy("__name__", "desc"), limit(1))
          );
        }
        qd = qSnap.empty ? null : (qSnap.docs[0].data() as any);
      } catch {}
      setName((qd?.fullName || u.fullName || u.name || u.nome || u.email || "Cliente").toString());
      setWorkoutFrequency(num(qd?.workoutFrequency));

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

        // Weekly weights → mapear para 2ª feira
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
        });

        const asc = (a: { x: number }, b: { x: number }) => a.x - b.x;
        pesoSemanal.sort(asc); pesoCheckin.sort(asc); massaMuscular.sort(asc); massaGorda.sort(asc); gorduraVisceral.sort(asc);
        setEvoData({ pesoSemanal, pesoCheckin, massaMuscular, massaGorda, gorduraVisceral });
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

      // Carregar planos (PDFs)
      try {
        const planSnap = await getDoc(doc(db, "users", uid, "plans", "latest"));
        let planData: any = planSnap.data() || {};
        if ((!planData.trainingUrl || !planData.dietUrl)) {
          try {
            const qs = await getDocs(collection(db, `users/${uid}/plans`));
            const all: any[] = [];
            qs.forEach(d=> all.push({ id: d.id, ...(d.data() as any) }));
            const treino = all.find(d => (d.type == "treino" || d.type == "training") && d.url);
            const alim = all.find(d => (d.type == "alimentacao" || d.type == "diet") && d.url);
            planData = { ...planData, ...(treino ? { trainingUrl: treino.url, trainingUpdatedAt: treino.createdAt || treino.updatedAt } : {}), ...(alim ? { dietUrl: alim.url, dietUpdatedAt: alim.createdAt || alim.updatedAt } : {}) };
          } catch {}
        }
        // Fallback direto ao Storage
        if (!planData.trainingUrl && storage) {
          try {
            const r = ref(storage, `plans/${uid}/training.pdf`);
            planData.trainingUrl = await getDownloadURL(r);
          } catch {}
        }
        if (!planData.dietUrl && storage) {
          try {
            const r = ref(storage, `plans/${uid}/diet.pdf`);
            planData.dietUrl = await getDownloadURL(r);
          } catch {}
        }
        setTrainingUrl(planData.trainingUrl || null);
        setDietUrl(planData.dietUrl || null);
        setTrainingAt(toDate(planData.trainingUpdatedAt ?? null));
        setDietAt(toDate(planData.dietUpdatedAt ?? null));
      } catch {}
      setPlansLoading(false);

      // Listar Fotos (conjuntos)
      try {
        if (storage) {
          const baseRef = ref(storage, `users/${uid}/photos`);
          const res = await listAll(baseRef);
          const items = await Promise.all(res.items.map(async (it)=>{
            const [url, meta] = await Promise.all([getDownloadURL(it), getMetadata(it)]);
            const createdAt = meta.timeCreated ? new Date(meta.timeCreated) : null;
            const name = it.name; // 2025-W36-...-0_main.jpg
            const setId = name.split("-").slice(0,3).join("-");
            const isMain = /_main\./i.test(name);
            return { setId, url, createdAt, isMain };
          }));
          const bySet = new Map<string, { createdAt: Date | null; urls: string[]; mainUrl: string }>();
          for (const it of items) {
            const s = bySet.get(it.setId) || { createdAt: it.createdAt, urls: [], mainUrl: "" };
            if (!s.createdAt) s.createdAt = it.createdAt;
            s.urls.push(it.url);
            if (it.isMain) s.mainUrl = it.url;
            bySet.set(it.setId, s);
          }
          const arr = Array.from(bySet.entries()).map(([id, s])=>({ id, createdAt: s.createdAt || null, urls: s.urls, mainUrl: s.mainUrl || s.urls[0] })).sort((a,b)=> (a.createdAt?.getTime()||0)-(b.createdAt?.getTime()||0));
          setPhotoSets(arr);
        } else {
          setPhotoSets([]);
        }
      } catch { setPhotoSets([]); } finally { setPhotosLoading(false); }

      // Listar InBody do utilizador (imagens)
      try {
        if (storage) {
          const dirRef = ref(storage, `users/${uid}/inbody`);
          const res = await listAll(dirRef);
          const items = await Promise.all(res.items.map(async (it) => {
            const [url, meta] = await Promise.all([getDownloadURL(it), getMetadata(it)]);
            let createdAt: Date | null = meta.timeCreated ? new Date(meta.timeCreated) : null;
            if (!createdAt) {
              const base = it.name.replace(/\.(png|jpg|jpeg)$/i, "");
              const n = Number(base);
              if (Number.isFinite(n) && n > 0) createdAt = new Date(n);
            }
            return { id: it.name, url, createdAt } as { id: string; url: string; createdAt: Date | null };
          }));
          items.sort((a,b)=>((b.createdAt?.getTime()||0)-(a.createdAt?.getTime()||0)) || b.id.localeCompare(a.id));
          setInbodyFiles(items);
        } else {
          setInbodyFiles([]);
        }
      } catch {
        setInbodyFiles([]);
      } finally {
        setInbodyLoading(false);
      }

      await loadPlAll(uid);

      setLoading(false);
    })();
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
      await uploadBytes(r, file, { contentType: "application/pdf" });
      const url = await getDownloadURL(r);
      const payload: any = { updatedAt: serverTimestamp() };
      if (kind === "training") { payload.trainingUrl = url; payload.trainingUpdatedAt = serverTimestamp(); }
      else { payload.dietUrl = url; payload.dietUpdatedAt = serverTimestamp(); }
      await setDoc(doc(db, "users", uid, "plans", "latest"), payload, { merge: true });
      if (kind === "training") { setTrainingUrl(url); setTrainingAt(new Date()); } else { setDietUrl(url); setDietAt(new Date()); }
    } catch (e: any) {
      const msg = e?.message || "Falha no upload.";
      if (kind === "training") setTrainingError(msg); else setDietError(msg);
      console.error("Upload plano falhou", e);
    } finally {
      if (kind === "training") setUploadingTraining(false); else setUploadingDiet(false);
    }
  }

  return (
    <CoachGuard>
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold truncate">{name}</h1>
            <div className="text-sm text-muted-foreground truncate">{email}</div>
            <div className="flex gap-2 mt-2 text-sm">
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
                  checked={coachOverride}
                  onChange={async (e) => {
                    const val = e.currentTarget.checked;
                    setCoachOverride(val);
                    try {
                      await updateDoc(doc(db, "users", uid), { imageUploadAllowedByCoach: val, updatedAt: serverTimestamp() });
                    } catch (err) {
                      setCoachOverride(!val);
                    }
                  }}
                />
                <span>Permitir upload de fotos</span>
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
          <Button size="sm" variant={visibleSection === "planos" ? "default" : "outline"} onClick={() => setVisibleSection("planos")}>Planos</Button>
          <Button size="sm" variant={visibleSection === "fotos" ? "default" : "outline"} onClick={() => setVisibleSection("fotos")}>Fotos</Button>
          <Button size="sm" variant={visibleSection === "inbody" ? "default" : "outline"} onClick={() => setVisibleSection("inbody")}>InBody</Button>
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
                      const best = plPrs[e][0] || null;
                      const label = e === "agachamento" ? "Agachamento" : e === "supino" ? "Supino" : "Levantamento Terra";
                      return (
                        <div key={e} className="rounded-2xl border p-4 bg-background">
                          <div className="text-sm font-medium mb-1">{label}</div>
                          {best ? (
                            <div className="text-sm text-slate-700">
                              Melhor: <span className="font-semibold">{best.weight} kg × {best.reps}</span>
                              <div className="text-xs text-slate-500 mt-1">1RM Estimada (Epley): {epley1RM(best.weight, best.reps)} kg</div>
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">Sem registos</div>
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
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col">
            <div className="relative m-4 md:m-10 bg-white rounded-xl shadow-xl flex-1 overflow-hidden">
              <div className="absolute top-3 right-3 flex gap-2">
                <Button size="sm" variant="outline" asChild><a href={preview.url} download>Download</a></Button>
                <Button size="sm" variant="secondary" onClick={()=>setPreview(null)}><X className="h-4 w-4" />Fechar</Button>
              </div>
              {preview.kind === "pdf" ? (
                <object data={preview.url} type="application/pdf" className="w-full h-full" aria-label="Pré-visualização PDF">
                  <iframe className="w-full h-full" src={"https://drive.google.com/viewerng/viewer?embedded=true&url="+encodeURIComponent(preview.url)} title="Pré-visualização PDF (alternativa)"></iframe>
                  <div className="p-6 text-sm">Não foi possível embutir o PDF. <a className="underline" href={preview.url} target="_blank" rel="noopener noreferrer">Abrir numa nova janela</a>.</div>
                </object>
              ) : (
                <div className="w-full h-full overflow-auto bg-black/5 flex items-center justify-center p-4">
                  <img src={preview.url} alt="InBody" className="max-w-full max-h-full rounded-lg shadow" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fotos (progresso) */}
        <Card className={"shadow-sm " + (visibleSection !== "fotos" ? "hidden" : "")}>
          <CardHeader>
            <CardTitle>Fotos</CardTitle>
          </CardHeader>
          <CardContent>
            {photosLoading ? (
              <div className="text-sm text-muted-foreground">A carregar…</div>
            ) : photoSets.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem fotos.</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border p-4 bg-background">
                    <div className="text-sm text-slate-700 mb-2">Início</div>
                    <button className="w-full text-left" onClick={()=>setOpenSet({ id: photoSets[0].id, urls: photoSets[0].urls })}>
                      <div className="relative w-full h-48 bg-muted rounded-xl overflow-hidden">
                        <img src={photoSets[0].mainUrl} alt="Inicio" className="absolute inset-0 w-full h-full object-contain" />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{photoSets[0].createdAt?.toLocaleString() ?? "—"}</div>
                    </button>
                  </div>
                  <div className="rounded-2xl border p-4 bg-background">
                    <div className="text-sm text-slate-700 mb-2">Atual</div>
                    <button className="w-full text-left" onClick={()=>setOpenSet({ id: photoSets[photoSets.length-1].id, urls: photoSets[photoSets.length-1].urls })}>
                      <div className="relative w-full h-48 bg-muted rounded-xl overflow-hidden">
                        <img src={photoSets[photoSets.length-1].mainUrl} alt="Atual" className="absolute inset-0 w-full h-full object-contain" />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{photoSets[photoSets.length-1].createdAt?.toLocaleString() ?? "—"}</div>
                    </button>
                  </div>
                </div>
                {photoSets.map((s)=> (
                  <div key={s.id} className="rounded-2xl border p-4 bg-background">
                    <div className="text-sm font-medium mb-2">{s.createdAt?.toLocaleString() ?? s.id}</div>
                    <div className="flex flex-wrap gap-2">
                      {s.urls.map((u, i)=> (
                        <button key={i} onClick={()=>setOpenSet({ id: s.id, urls: s.urls })} className="shrink-0">
                          <img src={u} alt="Foto" className="h-24 w-24 object-cover rounded-lg" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {openSet && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col">
            <div className="relative m-4 md:m-10 bg-white rounded-xl shadow-xl overflow-auto p-4">
              <div className="sticky top-2 right-2 flex justify-end">
                <Button size="sm" variant="secondary" onClick={()=>setOpenSet(null)}>Fechar</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {openSet.urls.map((u, i)=> (
                  <img key={i} src={u} alt={`Foto ${i+1}`} className="w-full rounded-xl object-contain" />
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
                      <Button size="sm" variant="secondary" onClick={()=>setPreview({ url: f.url, kind: "image" })}>Ver</Button>
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
