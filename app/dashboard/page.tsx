"use client";

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { lisbonYMD, lisbonTodayYMD } from "@/lib/utils";
import EmojiCalendar from "@/components/EmojiCalendar";
import SwitchableCalendar from "@/components/SwitchableCalendar";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  orderBy,
  limit,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

/** ===== Helpers de datas (Portugal/Lisboa) ===== */
function ymdUTC(d = new Date()) {
  return lisbonYMD(d);
}
function startOfISOWeekUTC(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // 1..7 (2ª=1,...,Dom=7)
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function endOfISOWeekUTC(date = new Date()) {
  const start = startOfISOWeekUTC(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6); // domingo
  end.setUTCHours(23, 59, 59, 999);
  return end;
}
function addDaysUTC(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}
function toYMD(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  const dt =
    typeof value.toDate === "function" ? value.toDate() :
    value instanceof Date ? value : null;
  return dt ? ymdUTC(dt) : null;
}
const num = (v: any) => (typeof v === "number" && !Number.isNaN(v) ? v : null);

/** ===== Tipos ===== */
type Daily = {
  id: string; // YYYY-MM-DD
  createdAt?: Date | null;
  didWorkout?: boolean | null;
  weight?: number | null;
  waterLiters?: number | null;
  steps?: number | null;
  metaAgua?: number | null;
  // legado
  treinou?: boolean | null;
  peso?: number | null;
  aguaLitros?: number | null;
  passos?: number | null;
  alimentacao100?: boolean | null;
};
type WeeklyStatus = { done: boolean };

export default function DashboardPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // users/{uid}
  const [lastCheckin, setLastCheckin] = useState<string | null>(null);
  const [nextCheckin, setNextCheckin] = useState<string | null>(null);
  const [objetivoPeso, setObjetivoPeso] = useState<"ganho" | "perda" | null>(null);
  const [showCheckinModal, setShowCheckinModal] = useState(false);

  // Nome e metas
  const [displayName, setDisplayName] = useState<string>("O meu painel");
  const [workoutFrequency, setWorkoutFrequency] = useState<number>(0); // objetivo semanal

  // daily/weekly
  const [todayDaily, setTodayDaily] = useState<Daily | null>(null);
  const [lastDaily, setLastDaily] = useState<Daily | null>(null);
  const [weekly, setWeekly] = useState<WeeklyStatus>({ done: false });

  // KPIs
  const [treinosSemana, setTreinosSemana] = useState<number>(0);
  const [streakAlimentacao, setStreakAlimentacao] = useState<number>(0);
  const [aguaMedia7, setAguaMedia7] = useState<number | null>(null);
  const [passosMedia7, setPassosMedia7] = useState<number | null>(null);

  // Aviso de planos atualizados pelo coach
  const [planNotice, setPlanNotice] = useState<{ id: string; title: string; message: string } | null>(null);

  // Pesos médios semanais
  const [pesoMedioSemanaAtual, setPesoMedioSemanaAtual] = useState<number | null>(null);
  const [pesoMedioSemanaAnterior, setPesoMedioSemanaAnterior] = useState<number | null>(null);
  const [fallbackPrevAvg, setFallbackPrevAvg] = useState<number | null>(null);

  // Meta de água (única fonte = users/{uid}.metaAgua)
  const [latestMetaAgua, setLatestMetaAgua] = useState<number | null>(null);

  const isPastCheckin = !!nextCheckin && nextCheckin < lisbonTodayYMD();
  const isTodayCheckin = !!nextCheckin && nextCheckin === lisbonTodayYMD();

  useEffect(() => {
    if (isPastCheckin || isTodayCheckin) setShowCheckinModal(true);
  }, [isPastCheckin, isTodayCheckin]);

  const todayId = useMemo(() => ymdUTC(new Date()), []);
  const isoStart = useMemo(() => startOfISOWeekUTC(new Date()), []);
  const isoEnd = useMemo(() => endOfISOWeekUTC(new Date()), []);

  // WhatsApp do coach para marcação
  const COACH_WHATSAPP = "351963032907";

  /** Auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUid(null);
        setLoading(false);
        try { router.replace("/login"); } catch {}
        return;
      }
      setUid(u.uid);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /** Carregar dados */
  useEffect(() => {
    if (!uid) return;

    (async () => {
      // users/{uid}
      const userSnap = await getDoc(doc(db, "users", uid));
      const udata: any = userSnap.data() || {};
      setLastCheckin(toYMD(udata.lastCheckinDate) || udata.lastCheckinText || null);
      setNextCheckin(toYMD(udata.nextCheckinDate) || udata.nextCheckinText || null);
      setObjetivoPeso(udata.objetivoPeso ?? null);

      let dn = (udata.fullName || udata.name || udata.nome || "").toString().trim();
      if (!dn) {
        try {
          let qQ = query(collection(db, `users/${uid}/questionnaire`), orderBy("completedAt", "desc"), limit(1));
          let sQ = await getDocs(qQ);
          if (sQ.empty) {
            try {
              qQ = query(collection(db, `users/${uid}/questionnaire`), orderBy("createdAt", "desc"), limit(1));
              sQ = await getDocs(qQ);
            } catch {}
          }
          if (sQ.empty) {
            try {
              qQ = query(collection(db, `users/${uid}/questionnaire`), orderBy("__name__", "desc"), limit(1));
              sQ = await getDocs(qQ);
            } catch {}
          }
          if (!sQ.empty) dn = String(sQ.docs[0].get("fullName") || "").trim();
        } catch {}
      }
      setDisplayName(dn || (udata.email || "O meu painel").toString());

      setWorkoutFrequency(num(udata.workoutFrequency) ?? 0);

      // meta de água vem SEMPRE do users
      setLatestMetaAgua(num(udata.metaAgua) ?? 3.0);

      // dailies (30)
      const dSnap = await getDocs(
        query(collection(db, `users/${uid}/dailyFeedback`), orderBy("date", "desc"), limit(30))
      );
      const dailies: Daily[] = [];
      dSnap.forEach((docSnap) => {
        const d: any = docSnap.data();
        dailies.push({
          id: docSnap.id,
          createdAt: d.createdAt?.toDate?.() || null,
          didWorkout: d.didWorkout ?? d.treinou ?? null,
          weight: num(d.weight) ?? num(d.peso),
          waterLiters: num(d.waterLiters) ?? num(d.aguaLitros),
          steps: num(d.steps) ?? num(d.passos),
          metaAgua: num(d.metaAgua),
          // legado já mapeado acima
          alimentacao100: d.alimentacao100 ?? d.alimentacaoOk ?? null,
        });
      });

      // último daily (desc)
      const lastDailyDoc = dailies[0] || null;
      setLastDaily(lastDailyDoc);

      // hoje
      setTodayDaily(dailies.find((x) => x.id === todayId) || null);

      // semana atual e anterior
      const startYMD = ymdUTC(isoStart);
      const endYMD = ymdUTC(isoEnd);
      const prevStart = addDaysUTC(isoStart, -7);
      const prevEnd = addDaysUTC(isoEnd, -7);
      const startPrevYMD = ymdUTC(prevStart);
      const endPrevYMD = ymdUTC(prevEnd);

      const semanaAtualDocs = dailies.filter((d) => d.id >= startYMD && d.id <= endYMD);
      const semanaAnteriorDocs = dailies.filter((d) => d.id >= startPrevYMD && d.id <= endPrevYMD);

      // treinos semana atual (canónico ou legado)
      setTreinosSemana(semanaAtualDocs.filter((d) => d.didWorkout === true).length);

      // streak alimentação 100% (contagem regressiva até hoje)
      let streak = 0;
      const sortedAsc = [...dailies].sort((a, b) => (a.id < b.id ? -1 : 1));
      for (let i = sortedAsc.length - 1; i >= 0; i--) {
        const d = sortedAsc[i];
        if (d.id > todayId) continue;
        if (d.alimentacao100) streak++;
        else break;
      }
      setStreakAlimentacao(streak);

      // médias 7 dias água/passos
      const last7 = [...dailies].slice(0, 7);
      const aguaVals = last7
        .map((d) => d.waterLiters)
        .filter((v): v is number => v !== null && v !== undefined);
      const passosVals = last7
        .map((d) => d.steps)
        .filter((v): v is number => v !== null && v !== undefined);
      setAguaMedia7(aguaVals.length ? +(aguaVals.reduce((a, b) => a + b, 0) / aguaVals.length).toFixed(2) : null);
      setPassosMedia7(passosVals.length ? Math.round(passosVals.reduce((a, b) => a + b, 0) / passosVals.length) : null);

      // pesos médios por semana
      const pesosSemanaAtual = semanaAtualDocs.map((d) => d.weight).filter((v): v is number => v !== null && v !== undefined);
      const pesosSemanaAnterior = semanaAnteriorDocs.map((d) => d.weight).filter((v): v is number => v !== null && v !== undefined);
      setPesoMedioSemanaAtual(pesosSemanaAtual.length ? +(pesosSemanaAtual.reduce((a, b) => a + b, 0) / pesosSemanaAtual.length).toFixed(1) : null);
      setPesoMedioSemanaAnterior(pesosSemanaAnterior.length ? +(pesosSemanaAnterior.reduce((a, b) => a + b, 0) / pesosSemanaAnterior.length).toFixed(1) : null);

      // fallback para "semana anterior" sem dados: procurar última média registada noutras semanas anteriores
      let fb: number | null = null;
      if (pesosSemanaAnterior.length === 0) {
        for (let k = 2; k <= 12; k++) {
          const ws = addDaysUTC(isoStart, -7 * k);
          const we = addDaysUTC(isoEnd, -7 * k);
          const wsY = ymdUTC(ws);
          const weY = ymdUTC(we);
          const docs = dailies.filter((d) => d.id >= wsY && d.id <= weY);
          const arr = docs.map((d) => d.weight).filter((v): v is number => v !== null && v !== undefined);
          if (arr.length) { fb = +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1); break; }
        }
      }
      setFallbackPrevAvg(fb);

      // weekly desta semana (feito?)
      const year = isoStart.getUTCFullYear();
      const jan1 = new Date(Date.UTC(year, 0, 1));
      const diffDays = Math.floor((+isoStart - +jan1) / 86400000);
      const weekNo = Math.ceil((diffDays + (jan1.getUTCDay() || 7)) / 7);
      const weekId = `${year}-W${String(weekNo).padStart(2, "0")}`;
      const wSnap = await getDoc(doc(db, `users/${uid}/weeklyFeedback/${weekId}`));
      setWeekly({ done: wSnap.exists() });

      // fallback de datas de check-in se users ainda não tiver
      const cSnap = await getDocs(query(collection(db, `users/${uid}/checkins`), orderBy("date", "desc"), limit(1)));
      if (!cSnap.empty) {
        const c0: any = cSnap.docs[0].data();
        if (!toYMD(udata.lastCheckinDate)) setLastCheckin(toYMD(c0.date));
        if (!toYMD(udata.nextCheckinDate)) setNextCheckin(toYMD(c0.nextDate));
      }

      // Notificação de planos atualizados (não lida)
      try {
        let q = query(
          collection(db, `users/${uid}/coachNotifications`),
          where("read", "==", false),
          where("kind", "==", "planos_atualizados"),
          orderBy("createdAt", "desc"),
          limit(1)
        );
        let qs = await getDocs(q);
        if (qs.empty) {
          try {
            q = query(collection(db, `users/${uid}/coachNotifications`), where("read", "==", false), orderBy("createdAt", "desc"), limit(5));
            qs = await getDocs(q);
          } catch {}
        }
        const doc0 = qs.docs.find((d) => (d.get("kind") === "planos_atualizados")) || null;
        if (doc0) {
          const title = String(doc0.get("title") || "Planos atualizados");
          const message = String(doc0.get("message") || "Recebeste novos planos (treino/alimentação).");
          setPlanNotice({ id: doc0.id, title, message });
        } else {
          setPlanNotice(null);
        }
      } catch {
        setPlanNotice(null);
      }
    })().catch((e) => console.error("Dashboard load error:", e));
  }, [uid, todayId, isoStart, isoEnd]);

  if (loading) return <div className="p-4">A carregar…</div>;
  if (!uid) return <div className="p-4">Inicia sessão para ver o teu painel.</div>;

  async function dismissPlanNotice() {
    try {
      if (!uid || !planNotice) return;
      await updateDoc(doc(db, `users/${uid}/coachNotifications/${planNotice.id}`), { read: true, readAt: serverTimestamp() });
    } catch {}
    setPlanNotice(null);
  }

  // WhatsApp (mensagem para marcar avaliação quando já passou ou é hoje)
  const waOverdueHref = `https://wa.me/${COACH_WHATSAPP}?text=${encodeURIComponent(
    `Olá Coach! Quero marcar a avaliação. O meu check-in está para ${nextCheckin ?? "—"}.`
  )}`;

  const canEditDaily = !!todayDaily;

  const lisbonWkd = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Lisbon" }).format(new Date());
  const isWeekend = lisbonWkd === "Sat" || lisbonWkd === "Sun";

  const needsDaily = !todayDaily;
  const needsWeekly = isWeekend && !weekly.done;

  // Cor do peso médio desta semana vs anterior em função do objetivo
  const pesoAlignClass = (() => {
    if (pesoMedioSemanaAtual == null || pesoMedioSemanaAnterior == null || !objetivoPeso) return "text-gray-900";
    if (objetivoPeso === "perda") {
      if (pesoMedioSemanaAtual < pesoMedioSemanaAnterior) return "text-green-600";
      if (pesoMedioSemanaAtual > pesoMedioSemanaAnterior) return "text-rose-600";
      return "text-gray-900";
    } else {
      if (pesoMedioSemanaAtual > pesoMedioSemanaAnterior) return "text-green-600";
      if (pesoMedioSemanaAtual < pesoMedioSemanaAnterior) return "text-rose-600";
      return "text-gray-900";
    }
  })();

  // Streak alimentação — decoração
  const streakBadge = streakAlimentacao >= 2 ? "🔥" : "";
  const streakClass = streakAlimentacao === 0 ? "text-rose-600" : "text-gray-900";

  const waPhone = process.env.NEXT_PUBLIC_WHATSAPP_PHONE;
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="w-10" />
        <h1 className="text-2xl font-semibold text-center flex-1">{displayName}</h1>
        <div className="w-10" />
      </div>

      {(needsDaily || needsWeekly) && (
        <div className="grid grid-cols-1 gap-3">
          {needsDaily && (
            <div className="rounded-2xl bg-[#FFF4D1] shadow-lg ring-2 ring-[#706800] p-5 flex flex-wrap gap-3 items-center justify-between text-[#706800]">
              <div>
                <div className="text-sm">Daily de hoje ({todayId})</div>
                <div className="text-lg">⛔ Em falta</div>
              </div>
              <div className="flex gap-2">
                <Link href="/daily" className="px-4 py-2 rounded-xl bg-[#D4AF37] text-white shadow hover:bg-[#BE9B2F]">Criar daily</Link>
              </div>
            </div>
          )}
          {needsWeekly && (
            <div className="rounded-2xl bg-[#FFF4D1] shadow-lg ring-2 ring-[#706800] p-5 flex flex-wrap gap-3 items-center justify-between text-[#706800]">
              <div>
                <div className="text-sm">Weekly desta semana</div>
                <div className="text-lg">⛔ Em falta</div>
              </div>
              <div className="flex gap-2">
                <Link href="/weekly" className="px-4 py-2 rounded-xl bg-[#D4AF37] text-white shadow hover:bg-[#BE9B2F]">Preencher semanal</Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Check-ins */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <div className="text-sm text-slate-700">Último check-in</div>
          <div className="text-xl font-semibold">{lastCheckin ?? "—"}</div>
        </div>
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-slate-700">Próximo check-in</div>
              <div className={`text-xl font-semibold ${isPastCheckin || isTodayCheckin ? "text-rose-600" : ""}`}>
                {nextCheckin ?? "—"}
              </div>
            </div>

            {(isPastCheckin || isTodayCheckin) && (
              <a
                href={waOverdueHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                title="Marcar avaliação (WhatsApp)"
              >
                <span aria-hidden>��</span>
                <span>WhatsApp</span>
              </a>
            )}
          </div>
          {isTodayCheckin && (
            <p className="text-xs text-gray-500 mt-1">É hoje – prepara-te para a avaliação!</p>
          )}
        </div>
      </div>

      {/* Peso atual + média na mesma card */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <div className="text-sm text-slate-700">Peso</div>
          <div className="text-2xl font-semibold">
            {todayDaily?.weight != null ? `${todayDaily.weight} kg` : lastDaily?.weight != null ? `${lastDaily.weight} kg` : "—"}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            média semana atual: <span className={`${pesoAlignClass}`}>{pesoMedioSemanaAtual != null ? `${pesoMedioSemanaAtual} kg` : "—"}</span>
            <div className="text-xs text-slate-500 mt-0.5">semana anterior: {pesoMedioSemanaAnterior != null ? `${pesoMedioSemanaAnterior} kg` : <>—{fallbackPrevAvg != null ? ` (${fallbackPrevAvg} kg)` : null}</>}</div>
          </div>
        </div>
      </div>

      {/* KPIs semana + médias 7 dias */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="col-span-2 md:col-span-1 rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <SwitchableCalendar uid={uid!} />
        </div>
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <div className="text-sm text-slate-700">
            💧 Água
            <div className="text-xs text-slate-500">média 7 dias</div>
          </div>
          <div className="text-2xl font-semibold">
            {aguaMedia7 != null ? aguaMedia7 : "—"}
            {latestMetaAgua != null ? ` / ${latestMetaAgua}` : ""}
          </div>
        </div>
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <div className="text-sm text-slate-700">
            👣 Passos
            <div className="text-xs text-slate-500">média 7 dias</div>
          </div>
          <div className="text-2xl font-semibold">{passosMedia7 ?? "—"}</div>
        </div>
      </div>


      {/* Daily hoje */}
      {!needsDaily && (
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <div className="text-sm text-slate-700">Feedback Diário de hoje ({todayId})</div>
            <div className="text-lg">{todayDaily ? "✅ Preenchido" : "⛔ Em falta"}</div>
          </div>
          <div className="flex gap-2">
            {todayDaily ? (
              <Link
                href="/daily"
                className={`px-4 py-2 rounded-[20px] overflow-hidden border-[3px] ${canEditDaily ? "border-[#706800] text-[#706800] bg-white hover:bg-[#FFF4D1]" : "border-slate-400 text-slate-500 bg-white opacity-60 cursor-not-allowed"} shadow`}
                onClick={(e) => { if (!canEditDaily) e.preventDefault(); }}
              >
                Editar
              </Link>
            ) : (
              <Link href="/daily" className="px-4 py-2 rounded-xl bg-[#D4AF37] text-white shadow hover:bg-[#BE9B2F]">
                Criar Feedback Diário
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Weekly */}
      {!needsWeekly && (
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <div className="text-sm text-slate-700">Feedback Semanal</div>
            <div className="text-lg">
              {weekly.done ? "✅ Preenchido" : isWeekend ? "⛔ Em falta" : "Disponivel durante o fim-de-semana"}
            </div>
          </div>
          {!weekly.done && isWeekend && (
            <Link href="/weekly" className="px-4 py-2 rounded-xl bg-[#D4AF37] text-white shadow hover:bg-[#BE9B2F]">
              Preencher semanal
            </Link>
          )}
        </div>
      )}

      <div className="pt-2 flex justify-center">
        <button
          type="button"
          onClick={() => { signOut(auth).finally(() => router.replace("/login")); }}
          className="rounded-[20px] overflow-hidden border-[3px] border-[#706800] text-[#706800] bg-white px-4 py-2 shadow hover:bg-[#FFF4D1]"
        >
          Terminar sessão
        </button>
      </div>

      {showCheckinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCheckinModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-300">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-lg font-semibold">Marcar avaliação</h2>
              <button type="button" aria-label="Fechar" className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100" onClick={() => setShowCheckinModal(false)}>✕</button>
            </div>
            <div className="p-4 space-y-3 text-slate-800">
              <p>Está na altura do teu check-in{nextCheckin ? ` (${nextCheckin})` : ""}. Marca a tua avaliação.</p>
              <div className="flex gap-2 justify-end pt-1">
                <a
                  href={waOverdueHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] text-white shadow hover:bg-[#BE9B2F]"
                >
                  WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => setShowCheckinModal(false)}
                  className="rounded-xl border border-slate-400 bg-white px-4 py-2 shadow-sm hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
