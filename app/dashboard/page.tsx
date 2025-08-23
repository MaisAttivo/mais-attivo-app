"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  orderBy,
  limit,
  query,
} from "firebase/firestore";

/** ===== Helpers de datas (UTC) ===== */
function ymdUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}
function startOfISOWeekUTC(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // 1..7 (2ª=1,...,Dom=7)
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d; // segunda-feira (00:00 UTC)
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
function isSameOrBeforeUTC(ymdA: string, ymdB: string) {
  return ymdA <= ymdB; // lexicográfico funciona para YYYY-MM-DD
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
  id: string;
  date?: Date | null;
  createdAt?: Date | null;
  // canónico
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

export default function ClientDashboardPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // users/{uid}
  const [lastCheckin, setLastCheckin] = useState<string | null>(null);
  const [nextCheckin, setNextCheckin] = useState<string | null>(null);
  const [objetivoPeso, setObjetivoPeso] = useState<"ganho" | "perda" | null>(null);

  // Nome e metas vindas do questionnaire
  const [displayName, setDisplayName] = useState<string>("O meu painel");
  const [workoutFrequency, setWorkoutFrequency] = useState<number>(0);
  const [questionnaireMetaAgua, setQuestionnaireMetaAgua] = useState<number | null>(null);

  // daily/weekly
  const [todayDaily, setTodayDaily] = useState<Daily | null>(null);
  const [lastDaily, setLastDaily] = useState<Daily | null>(null);
  const [weekly, setWeekly] = useState<WeeklyStatus>({ done: false });

  // KPIs
  const [treinosSemana, setTreinosSemana] = useState<number>(0);
  const [streakAlimentacao, setStreakAlimentacao] = useState<number>(0);
  const [aguaMedia7, setAguaMedia7] = useState<number | null>(null);
  const [passosMedia7, setPassosMedia7] = useState<number | null>(null);

  // Pesos médios semanais
  const [pesoMedioSemanaAtual, setPesoMedioSemanaAtual] = useState<number | null>(null);
  const [pesoMedioSemanaAnterior, setPesoMedioSemanaAnterior] = useState<number | null>(null);

  // Deltas entre os 2 últimos check-ins
  const [deltaMM, setDeltaMM] = useState<number | null>(null);      // massa muscular
  const [deltaMG, setDeltaMG] = useState<number | null>(null);      // massa gorda
  const [deltaPesoCI, setDeltaPesoCI] = useState<number | null>(null); // peso total (para a seta)

  // Meta de água mais recente (global)
  const [latestMetaAgua, setLatestMetaAgua] = useState<number | null>(null);

  const todayId = useMemo(() => ymdUTC(new Date()), []);
  const isoStart = useMemo(() => startOfISOWeekUTC(new Date()), []);
  const isoEnd = useMemo(() => endOfISOWeekUTC(new Date()), []);

  // WhatsApp do coach (altera para o teu nº com indicativo)
  const COACH_WHATSAPP = "351912345678";

  /** Auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUid(null);
        setLoading(false);
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
      setLastCheckin(toYMD(udata.lastCheckinDate));
      setNextCheckin(toYMD(udata.nextCheckinDate));
      setObjetivoPeso(udata.objetivoPeso ?? null);

      // questionnaire (último)
      const qSnap = await getDocs(
        query(collection(db, `users/${uid}/questionnaire`), orderBy("createdAt", "desc"), limit(1))
      );
      if (!qSnap.empty) {
        const qd: any = qSnap.docs[0].data();
        const name = (qd.fullName || udata.name || udata.email || "O meu painel").toString();
        setDisplayName(name);
        setWorkoutFrequency(num(qd.workoutFrequency) ?? 0);
        setQuestionnaireMetaAgua(num(qd.metaAgua));
      } else {
        setDisplayName((udata.name || udata.email || "O meu painel").toString());
        setWorkoutFrequency(0);
        setQuestionnaireMetaAgua(null);
      }

      // dailies (30)
      const dq = query(
        collection(db, `users/${uid}/dailyFeedback`),
        orderBy("date", "desc"),
        limit(30)
      );
      const dSnap = await getDocs(dq);
      const dailies: Daily[] = [];
      dSnap.forEach((docSnap) => {
        const d: any = docSnap.data();
        dailies.push({
          id: docSnap.id,
          date: d.date?.toDate?.() || null,
          createdAt: d.createdAt?.toDate?.() || null,
          // canónico
          didWorkout: d.didWorkout ?? null,
          weight: num(d.weight),
          waterLiters: num(d.waterLiters),
          steps: num(d.steps),
          metaAgua: num(d.metaAgua),
          // legado
          treinou: d.treinou ?? null,
          peso: num(d.peso),
          aguaLitros: num(d.aguaLitros),
          passos: num(d.passos),
          alimentacao100: d.alimentacao100 ?? d.alimentacaoOk ?? null,
        });
      });

      // último daily (desc)
      const lastDailyDoc = dailies[0] || null;
      setLastDaily(lastDailyDoc);

      // hoje
      const today = dailies.find((x) => x.id === todayId) || null;
      setTodayDaily(today || null);

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
      setTreinosSemana(semanaAtualDocs.filter((d) => d.didWorkout === true || d.treinou === true).length);

      // streak alimentação 100% (contagem regressiva até hoje)
      let streak = 0;
      const sortedAsc = [...dailies].sort((a, b) => (a.id < b.id ? -1 : 1));
      for (let i = sortedAsc.length - 1; i >= 0; i--) {
        const d = sortedAsc[i];
        if (!isSameOrBeforeUTC(d.id, todayId)) continue;
        if (d.alimentacao100) streak++;
        else break;
      }
      setStreakAlimentacao(streak);

      // médias 7 dias água/passos
      const last7 = dailies.slice(0, 7).sort((a, b) => (a.id < b.id ? -1 : 1));
      const aguaVals = last7
        .map((d) => num(d.waterLiters) ?? num(d.aguaLitros))
        .filter((v): v is number => v !== null);
      const passosVals = last7
        .map((d) => num(d.steps) ?? num(d.passos))
        .filter((v): v is number => v !== null);
      setAguaMedia7(aguaVals.length ? +(aguaVals.reduce((a, b) => a + b, 0) / aguaVals.length).toFixed(2) : null);
      setPassosMedia7(passosVals.length ? Math.round(passosVals.reduce((a, b) => a + b, 0) / passosVals.length) : null);

      // pesos médios por semana (canónico/legado)
      const pesosSemanaAtual = semanaAtualDocs
        .map((d) => num(d.weight) ?? num(d.peso))
        .filter((v): v is number => v !== null);
      const pesosSemanaAnterior = semanaAnteriorDocs
        .map((d) => num(d.weight) ?? num(d.peso))
        .filter((v): v is number => v !== null);
      setPesoMedioSemanaAtual(
        pesosSemanaAtual.length ? +(pesosSemanaAtual.reduce((a, b) => a + b, 0) / pesosSemanaAtual.length).toFixed(1) : null
      );
      setPesoMedioSemanaAnterior(
        pesosSemanaAnterior.length ? +(pesosSemanaAnterior.reduce((a, b) => a + b, 0) / pesosSemanaAnterior.length).toFixed(1) : null
      );

      // últimos 2 check-ins (para deltas e meta fallback/último/próximo)
      const cq = query(collection(db, `users/${uid}/checkins`), orderBy("date", "desc"), limit(2));
      const cSnap = await getDocs(cq);
      const cis: any[] = [];
      cSnap.forEach((d) => cis.push({ id: d.id, ...d.data() }));

      if (cis.length >= 1) {
        // last/next em fallback, se users/{uid} ainda não tiver
        if (!toYMD(udata.lastCheckinDate)) setLastCheckin(toYMD(cis[0].date));
        if (!toYMD(udata.nextCheckinDate)) setNextCheckin(toYMD(cis[0].nextDate));
      }

      if (cis.length >= 2) {
        const [c0, c1] = cis; // c0 = mais recente
        const mm0 = num(c0.massaMuscular);
        const mm1 = num(c1.massaMuscular);
        const mg0 = num(c0.massaGorda);
        const mg1 = num(c1.massaGorda);
        const p0 = num(c0.weight) ?? num(c0.peso);
        const p1 = num(c1.weight) ?? num(c1.peso);

        setDeltaMM(mm0 !== null && mm1 !== null ? +(mm0 - mm1).toFixed(1) : null);
        setDeltaMG(mg0 !== null && mg1 !== null ? +(mg0 - mg1).toFixed(1) : null);
        setDeltaPesoCI(p0 !== null && p1 !== null ? +(p0 - p1).toFixed(1) : null);
      } else {
        setDeltaMM(null);
        setDeltaMG(null);
        setDeltaPesoCI(null);
      }

      // ===== Meta de água mais recente =====
      // 1) metaAgua: daily → check-in → questionnaire
      const metaDirect =
        num(todayDaily?.metaAgua) ??
        num(lastDailyDoc?.metaAgua) ??
        num(cis[0]?.metaAgua) ??
        questionnaireMetaAgua;

      // 2) se nenhuma meta direta, calcular pelo peso mais recente: daily → check-in → questionnaire
      const weightMostRecent =
        num(todayDaily?.weight) ?? num(todayDaily?.peso) ??
        num(lastDailyDoc?.weight) ?? num(lastDailyDoc?.peso) ??
        num(cis[0]?.weight) ?? num(cis[0]?.peso) ??
        num(qSnap?.docs?.[0]?.data()?.weight) ?? num(qSnap?.docs?.[0]?.data()?.peso);

      const metaCalc = weightMostRecent ? Number((weightMostRecent * 0.05).toFixed(2)) : null;

      setLatestMetaAgua(metaDirect ?? metaCalc ?? 3.0);

      // weekly desta semana (só estado "feito?")
      const isoYear = isoStart.getUTCFullYear();
      const weekNumber = (() => {
        const d = startOfISOWeekUTC(new Date());
        const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const days = Math.floor((+d - +jan1) / 86400000) + 1;
        return Math.ceil((days + (jan1.getUTCDay() || 7) - 1) / 7);
      })();
      const weekId = `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
      const wSnap = await getDoc(doc(db, `users/${uid}/weeklyFeedback/${weekId}`));
      setWeekly({ done: wSnap.exists() });
    })().catch((e) => console.error("Dashboard load error:", e));
  }, [uid, todayId, isoStart, isoEnd, questionnaireMetaAgua]);

  if (loading) return <div className="p-4">A carregar…</div>;
  if (!uid) return <div className="p-4">Inicia sessão para ver o teu painel.</div>;

  // WhatsApp apenas se próximo check-in é hoje ou já passou
  const showWhatsapp =
    !!nextCheckin && isSameOrBeforeUTC(nextCheckin!, ymdUTC(new Date()));
  const whatsappHref = `https://wa.me/${COACH_WHATSAPP}?text=${encodeURIComponent(
    `Olá Coach! Sobre o meu check-in (próximo: ${nextCheckin ?? "—"}).`
  )}`;

  // Pode editar daily nas primeiras 2h
  const canEditDaily =
    !!todayDaily?.createdAt &&
    Date.now() < ((todayDaily.createdAt as Date).getTime() + 2 * 60 * 60 * 1000);

  // Fim de semana (UTC)
  const isWeekend = [0, 6].includes(new Date().getUTCDay());

  // ===== Cor e seta do bloco de peso =====
  const pesoArrow = deltaPesoCI === null ? "" : deltaPesoCI > 0 ? "⬆️" : deltaPesoCI < 0 ? "⬇️" : "→";
  const pesoClass = (() => {
    if (!objetivoPeso) return "text-gray-800";
    if (objetivoPeso === "ganho") {
      if (deltaMM === null) return "text-gray-800";
      if (deltaMM > 0) return "text-green-600";
      if (deltaMM < 0) return "text-red-600";
      return "text-gray-800";
    } else {
      if (deltaMG === null) return "text-gray-800";
      if (deltaMG < 0) return "text-green-600";
      if (deltaMG > 0) return "text-red-600";
      return "text-gray-800";
    }
  })();

  // Água — HOJE: litros do daily de hoje (ou último daily) + "de Meta"
  const litrosHoje =
    num(todayDaily?.waterLiters) ?? num(todayDaily?.aguaLitros) ??
    num(lastDaily?.waterLiters) ?? num(lastDaily?.aguaLitros);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">{displayName}</h1>

      {/* Check-ins */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border rounded-2xl p-4">
          <div className="text-sm text-gray-500">Último check-in</div>
          <div className="text-xl font-semibold">{lastCheckin ?? "—"}</div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-sm text-gray-500">Próximo check-in</div>
          <div className="text-xl font-semibold">{nextCheckin ?? "—"}</div>
        </div>
        <div className="border rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Precisas falar com o coach?</div>
            <div className="text-xs text-gray-500">Mostra se o check-in é hoje ou já passou.</div>
          </div>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`px-4 py-2 rounded-xl text-white shadow ${
              showWhatsapp ? "bg-green-600 hover:bg-green-700" : "bg-gray-300 cursor-not-allowed"
            }`}
            aria-disabled={!showWhatsapp}
            onClick={(e) => {
              if (!showWhatsapp) e.preventDefault();
            }}
          >
            WhatsApp
          </a>
        </div>
      </div>

      {/* KPIs semana + médias 7 dias */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="border rounded-2xl p-4">
          <div className="text-sm text-gray-500">Treinos feitos (semana)</div>
          <div className="text-2xl font-semibold">
            {treinosSemana}{workoutFrequency ? ` de ${workoutFrequency}` : ""}
          </div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-sm text-gray-500">Streak alimentação 100%</div>
          <div className="text-2xl font-semibold">{streakAlimentacao}</div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-sm text-gray-500">Água — hoje</div>
          <div className="text-2xl font-semibold">
            {litrosHoje != null ? litrosHoje : "—"}
            {latestMetaAgua != null ? ` de ${latestMetaAgua}` : ""}
          </div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-sm text-gray-500">Passos — média 7 dias</div>
          <div className="text-2xl font-semibold">{passosMedia7 ?? "—"}</div>
        </div>
      </div>

      {/* Pesos médios + variação com cor/seta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border rounded-2xl p-4">
          <div className="text-sm text-gray-500">Peso médio — semana atual</div>
          <div className={`text-2xl font-semibold ${pesoClass}`}>
            {pesoMedioSemanaAtual !== null ? `${pesoMedioSemanaAtual} kg ${pesoArrow}` : "—"}
          </div>
          {(deltaMM !== null || deltaMG !== null) && (
            <div className="text-xs text-gray-500 mt-1">
              {objetivoPeso === "ganho" && deltaMM !== null && (
                <>Δ MM: {deltaMM > 0 ? "+" : ""}{deltaMM} kg</>
              )}
              {objetivoPeso === "perda" && deltaMG !== null && (
                <>Δ MG: {deltaMG > 0 ? "+" : ""}{deltaMG} kg</>
              )}
            </div>
          )}
        </div>
        <div className="border rounded-2xl p-4">
          <div className="text-sm text-gray-500">Peso médio — semana anterior</div>
          <div className="text-2xl font-semibold">
            {pesoMedioSemanaAnterior !== null ? `${pesoMedioSemanaAnterior} kg` : "—"}
          </div>
        </div>
      </div>

      {/* Daily hoje */}
      <div className="border rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <div className="text-sm text-gray-500">Daily de hoje ({todayId})</div>
          <div className="text-lg">{todayDaily ? "✅ Preenchido" : "⛔ Em falta"}</div>
        </div>
        <div className="flex gap-2">
          {todayDaily ? (
            <Link
              href="/daily"
              className={`px-4 py-2 rounded-xl border hover:shadow ${
                canEditDaily ? "" : "opacity-50 cursor-not-allowed"
              }`}
              onClick={(e) => {
                if (!canEditDaily) e.preventDefault();
              }}
            >
              Editar
            </Link>
          ) : (
            <Link href="/daily" className="px-4 py-2 rounded-xl border hover:shadow">
              Criar daily
            </Link>
          )}
        </div>
      </div>

      {/* Weekly */}
      <div className="border rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <div className="text-sm text-gray-500">Weekly desta semana</div>
          <div className="text-lg">
            {weekly.done ? "✅ Preenchido" : isWeekend ? "⛔ Em falta" : "— (disponível ao fim-de-semana)"}
          </div>
        </div>
        {!weekly.done && isWeekend && (
          <Link href="/weekly" className="px-4 py-2 rounded-xl border hover:shadow">
            Preencher semanal
          </Link>
        )}
      </div>
    </div>
  );
}
