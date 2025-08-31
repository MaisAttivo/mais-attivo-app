"use client";

"use client";

import { use, useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import CoachGuard from "@/components/ui/CoachGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lisbonYMD, lisbonTodayYMD } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Info } from "lucide-react";

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

export default function CoachClientProfilePage(
  props: { params: Promise<{ uid: string }> }
) {
  // Next 15: params é uma Promise → usar React.use()
  const { uid } = use(props.params);

  const [loading, setLoading] = useState(true);

  // Header info
  const [name, setName] = useState<string>("Cliente");
  const [email, setEmail] = useState<string>("—");
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

  useEffect(() => {
    (async () => {
      setLoading(true);

      // users/{uid}
      const uSnap = await getDoc(doc(db, "users", uid));
      const u = (uSnap.data() as any) || {};
      setEmail(u.email ?? "—");

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

      setLoading(false);
    })();
  }, [uid]);

  async function saveCoachNote(checkinId: string) {
    const text = (noteById[checkinId] ?? "").trim();
    setSavingNoteId(checkinId);
    try {
      const noteRef = doc(db, `users/${uid}/checkins/${checkinId}/coachNotes/default`);
      await setDoc(
        noteRef,
        {
          privateComment: text,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("save note error", e);
    } finally {
      setSavingNoteId(null);
    }
  }

  const novoCheckinHref = `/checkin?clientId=${uid}`;
  const editarUltimoHref = checkins[0]?.id ? `/checkin?clientId=${uid}&checkinId=${checkins[0].id}` : "";

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
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editarUltimoHref && (
              <Link href={editarUltimoHref}>
                <Button variant="secondary">Editar último check-in</Button>
              </Link>
            )}
            <Link href={novoCheckinHref}>
              <Button>Novo check-in</Button>
            </Link>
            <Link href="/coach" className="text-sm underline ml-2">
              ← Voltar
            </Link>
          </div>
        </div>

        {/* Dailies */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Últimos 7 dailies</CardTitle>
          </CardHeader>
          <CardContent>
            {dailies.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem registos.</div>
            ) : (
              <div className="overflow-x-auto">
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
                          <td className="py-2 pr-4">{d.notes ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly */}
        <Card className="shadow-sm">
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

        {/* Check-ins */}
        <Card className="shadow-sm">
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
