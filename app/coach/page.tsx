"use client";

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { db, auth } from "@/lib/firebase";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, Filter as FilterIcon, Search, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, daysBetweenLisbon, formatLisbonDate, lisbonTodayYMD, lisbonYMD } from "@/lib/utils";
import CoachGuard from "@/components/ui/CoachGuard";
import { useRouter } from "next/navigation";

/* ========= Tipos ========= */
type DailyFeedback = {
  id: string;
  date: Timestamp;
  didWorkout?: boolean | null;
  waterLiters?: number | null;
  alimentacao100?: boolean | null;
  weight?: number | null;
  peso?: number | null;
  metaAgua?: number | null;
};

type Questionnaire = {
  id: string;
  createdAt?: Timestamp | null;
  fullName?: string | null;
  metaAgua?: number | null;
  weight?: number | null;
  weightKg?: number | null;
};

type Cliente = {
  id: string;
  nome: string;
  email?: string;
  phone?: string;
  active?: boolean;
  ultimoDF?: DailyFeedback | null;
  metaAguaLitros: number;
  diasDesdeUltimoDF?: number | null;
  diasSemTreinar?: number | null;
  diasSemAlimentacaoOK?: number | null;
  diasSemAguaOK?: number | null;
  diasPlanoTreino?: number | null;
  nextCheckinYMD?: string | null;
  dueStatus?: "today" | "overdue" | null;
};

/* ========= Utils ========= */
const toDate = (ts?: Timestamp | null) => (ts ? ts.toDate() : null);
const daysBetween = (a: Date, b: Date) => daysBetweenLisbon(a, b);

/* ========= Auth helper ========= */
function useAuthReady() {
  const [state, setState] = useState<{ ready: boolean; uid: string | null }>({
    ready: false,
    uid: null,
  });
  useEffect(() => onAuthStateChanged(auth, (u) => setState({ ready: true, uid: u?.uid ?? null })), []);
  return state;
}

/* ========= Filtros/derivadas ========= */
export type FilterKey =
  | "inativos4d"
  | "semTreino5d"
  | "semAlimentacao5d"
  | "agua3d"
  | "treino2m"
  | "fazerCheckin"
  | "contaInativa"
  | "semFiltro";

function getDerivedMetricsFromHistory(history: DailyFeedback[], metaAgua: number) {
  const now = new Date();
  const last = history[0];
  const diasDesdeUltimoDF = last?.date ? daysBetween(now, toDate(last.date)!) : Infinity;

  let diasSemTreinar = Infinity;
  for (const df of history as any[]) {
    const trained = (df as any).didWorkout === true || (df as any).treinou === true || (df as any).trained === true;
    if (trained) {
      diasSemTreinar = daysBetween(now, toDate(df.date)!);
      break;
    }
  }

  let diasSemAlimentacaoOK = Infinity;
  for (const df of history) {
    if (df.alimentacao100 === true) {
      diasSemAlimentacaoOK = daysBetween(now, toDate(df.date)!);
      break;
    }
  }

  let diasSemAguaOK = Infinity;
  for (const df of history as any[]) {
    const agua = (df as any).waterLiters ?? (df as any).aguaLitros ?? 0;
    if (agua >= metaAgua) {
      diasSemAguaOK = daysBetween(now, toDate(df.date)!);
      break;
    }
  }

  return { diasDesdeUltimoDF, diasSemTreinar, diasSemAlimentacaoOK, diasSemAguaOK, last };
}

type RealFilterKey = "inativos4d" | "semTreino5d" | "semAlimentacao5d" | "agua3d" | "treino2m";

const num = (v: unknown, fb = Infinity) => (typeof v === "number" && Number.isFinite(v) ? v : fb);

const filterPredicates: Partial<Record<RealFilterKey, (c: Cliente) => boolean>> = {
  inativos4d: (c) => num(c.diasDesdeUltimoDF) >= 4,
  semTreino5d: (c) => num(c.diasSemTreinar) >= 5,
  semAlimentacao5d: (c) => num(c.diasSemAlimentacaoOK) >= 5,
  agua3d: (c) => num(c.diasSemAguaOK) >= 3,
  treino2m: (c) => num(c.diasPlanoTreino) >= 60,
} as const;

function aplicarFiltro(c: Cliente, ativo: RealFilterKey): boolean {
  const pred = filterPredicates[ativo];
  return pred ? pred(c) : true;
}

/* ========= Helpers: nome + meta de água ========= */

// Nome robusto: users.fullName → users.name → users.nome → questionnaire.fullName → email → uid
async function resolveDisplayName(userId: string, userEmail?: string) {
  try {
    const us = await getDoc(doc(db, "users", userId));
    if (us.exists()) {
      const u = us.data() as any;
      const fromUsers =
        (u.fullName as string) ||
        (u.name as string) ||
        (u.nome as string) ||
        "";
      if (fromUsers && String(fromUsers).trim()) return String(fromUsers).trim();
    }
  } catch {}

  try {
    let qQ = query(collection(db, `users/${userId}/questionnaire`), orderBy("completedAt", "desc"), limit(1));
    let snap = await getDocs(qQ);
    if (snap.empty) {
      try {
        qQ = query(collection(db, `users/${userId}/questionnaire`), orderBy("createdAt", "desc"), limit(1));
        snap = await getDocs(qQ);
      } catch {}
    }
    if (snap.empty) {
      try {
        qQ = query(collection(db, `users/${userId}/questionnaire`), orderBy("__name__", "desc"), limit(1));
        snap = await getDocs(qQ);
      } catch {}
    }
    if (!snap.empty) {
      const fullName = (snap.docs[0].get("fullName") as string | undefined)?.trim();
      if (fullName) return fullName;
    }
  } catch {}

  if (userEmail && userEmail.trim()) return userEmail.trim();
  return userId;
}

// Meta mais recente: daily → checkin → questionnaire → (peso × 0.05) → 3.0
async function fetchLatestHydrationTarget(userId: string): Promise<number> {
  // daily
  try {
    const qDaily = query(collection(db, `users/${userId}/dailyFeedback`), orderBy("date", "desc"), limit(1));
    const s = await getDocs(qDaily);
    if (!s.empty) {
      const d = s.docs[0].data() as any;
      const weight = (d.weight ?? d.peso) as number | undefined;
      const meta = (d.metaAgua as number | undefined) ?? (typeof weight === "number" ? weight * 0.05 : undefined);
      if (typeof meta === "number") return Number(meta.toFixed(2));
    }
  } catch {}

  // checkin
  try {
    const qC = query(collection(db, `users/${userId}/checkins`), orderBy("date", "desc"), limit(1));
    const s = await getDocs(qC);
    if (!s.empty) {
      const d = s.docs[0].data() as any;
      const weight = (d.weight ?? d.peso) as number | undefined;
      const meta = (d.metaAgua as number | undefined) ?? (typeof weight === "number" ? weight * 0.05 : undefined);
      if (typeof meta === "number") return Number(meta.toFixed(2));
    }
  } catch {}

  // questionnaire
  try {
    let qQ = query(collection(db, `users/${userId}/questionnaire`), orderBy("completedAt", "desc"), limit(1));
    let s = await getDocs(qQ);
    if (s.empty) {
      try {
        qQ = query(collection(db, `users/${userId}/questionnaire`), orderBy("createdAt", "desc"), limit(1));
        s = await getDocs(qQ);
      } catch {}
    }
    if (s.empty) {
      try {
        qQ = query(collection(db, `users/${userId}/questionnaire`), orderBy("__name__", "desc"), limit(1));
        s = await getDocs(qQ);
      } catch {}
    }
    if (!s.empty) {
      const d = s.docs[0].data() as Questionnaire;
      const weight = (d.weight ?? d.weightKg) as number | undefined;
      const meta = (d.metaAgua as number | undefined) ?? (typeof weight === "number" ? weight * 0.05 : undefined);
      if (typeof meta === "number") return Number(meta.toFixed(2));
    }
  } catch {}

  return 3.0;
}

/* ========= Página ========= */
function CoachDashboard() {
  const { ready, uid } = useAuthReady();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<FilterKey, boolean>>({
    semFiltro: true,
    inativos4d: false,
    semTreino5d: false,
    semAlimentacao5d: false,
    agua3d: false,
    treino2m: false,
    fazerCheckin: false,
    contaInativa: false,
  });

  const cleanPhone = (p?: string) => (p ? String(p).replace(/[^\d]/g, "") : "");
  async function fetchClientes() {
    setLoading(true);
    try {
      // users (menos coaches)
      const usersSnap = await getDocs(query(collection(db, "users"), orderBy("email", "asc")));
      const base = usersSnap.docs
        .filter((d) => (d.data() as any)?.role !== "coach")
        .map((d) => ({
          id: d.id,
          email: d.get("email") ?? undefined,
          active: typeof d.get("active") === "boolean" ? (d.get("active") as boolean) : true,
        }));

      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const enriched = await Promise.all(
        base.map(async (u) => {
          const nomeFinal = await resolveDisplayName(u.id, u.email);
          const metaAgua = await fetchLatestHydrationTarget(u.id);

          let nextCheckinYMD: string | null = null;
          try {
            const us = await getDoc(doc(db, "users", u.id));
            if (us.exists()) {
              const data: any = us.data();
              const nd: Date | null = data.nextCheckinDate?.toDate?.() ?? null;
              if (nd) nextCheckinYMD = lisbonYMD(nd);
              else if (typeof data.nextCheckinText === "string") nextCheckinYMD = data.nextCheckinText;
              (u as any).phone = (data.phone ?? data.phoneNumber ?? data.telefone ?? "").toString().trim() || undefined;
            }
          } catch {}
          if (!nextCheckinYMD) {
            try {
              const qC = query(collection(db, `users/${u.id}/checkins`), orderBy("date", "desc"), limit(1));
              const sC = await getDocs(qC);
              if (!sC.empty) {
                const d: any = sC.docs[0].data();
                const nd: Date | null = d.nextDate?.toDate?.() ?? null;
                if (nd) nextCheckinYMD = lisbonYMD(nd);
              }
            } catch {}
          }
          const today = lisbonTodayYMD();
          const dueStatus: "today" | "overdue" | null = nextCheckinYMD
            ? nextCheckinYMD < today
              ? "overdue"
              : nextCheckinYMD === today
              ? "today"
              : null
            : null;

          const qDF = query(
            collection(db, `users/${u.id}/dailyFeedback`),
            orderBy("date", "desc"),
            limit(30)
          );
          const dfSnap = await getDocs(qDF);
          const history: DailyFeedback[] = dfSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) } as DailyFeedback))
            .filter((d) => {
              const dt = toDate(d.date);
              return dt ? dt.getTime() >= twoWeeksAgo.getTime() : false;
            });

          const m = getDerivedMetricsFromHistory(history, metaAgua);

          // Plano de treino: última atualização
          let diasPlanoTreino: number | null = null;
          try {
            const pSnap = await getDoc(doc(db, "users", u.id, "plans", "latest"));
            let dt: Date | null = null;
            if (pSnap.exists()) {
              const d: any = pSnap.data();
              const ts = d.trainingUpdatedAt ?? d.updatedAt ?? null;
              dt = ts?.toDate?.() ?? null;
            }
            if (!dt) {
              try {
                const pAll = await getDocs(collection(db, `users/${u.id}/plans`));
                let best: Date | null = null;
                pAll.forEach((docu) => {
                  const d: any = docu.data();
                  const isTraining = d.type === "treino" || d.type === "training";
                  if (!isTraining) return;
                  const cand = (d.updatedAt?.toDate?.() ?? d.createdAt?.toDate?.() ?? null) as Date | null;
                  if (cand && (!best || cand.getTime() > best.getTime())) best = cand;
                });
                dt = best;
              } catch {}
            }
            if (dt) diasPlanoTreino = daysBetween(new Date(), dt);
          } catch {}

          return {
            id: u.id,
            nome: nomeFinal,
            email: u.email,
            phone: (u as any).phone,
            active: u.active,
            ultimoDF: m.last ?? null,
            metaAguaLitros: metaAgua,
            diasDesdeUltimoDF: Number.isFinite(m.diasDesdeUltimoDF) ? m.diasDesdeUltimoDF : null,
            diasSemTreinar: Number.isFinite(m.diasSemTreinar) ? m.diasSemTreinar : null,
            diasSemAlimentacaoOK: Number.isFinite(m.diasSemAlimentacaoOK) ? m.diasSemAlimentacaoOK : null,
            diasSemAguaOK: Number.isFinite(m.diasSemAguaOK) ? m.diasSemAguaOK : null,
            diasPlanoTreino: Number.isFinite(diasPlanoTreino as number) ? (diasPlanoTreino as number) : null,
            nextCheckinYMD,
            dueStatus,
          } as Cliente;
        })
      );

      setClientes(enriched);
    } catch (e) {
      console.error(e);
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready && uid) fetchClientes();
  }, [ready, uid]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = clientes.filter((c) =>
      term ? `${c.nome} ${c.email ?? ""}`.toLowerCase().includes(term) : true
    );

    // Por omissão, esconder contas inativas
    if (!activeFilters.contaInativa) {
      list = list.filter((c) => c.active !== false);
    } else {
      list = list.filter((c) => c.active === false);
    }

    const anySpecific = Object.entries(activeFilters).some(([k, v]) => k !== "semFiltro" && k !== "contaInativa" && v);
    if (!anySpecific) return list;

    return list.filter((c) => {
      let keep = true;
      if (activeFilters.inativos4d) keep = keep && aplicarFiltro(c, "inativos4d");
      if (activeFilters.semTreino5d) keep = keep && aplicarFiltro(c, "semTreino5d");
      if (activeFilters.semAlimentacao5d) keep = keep && aplicarFiltro(c, "semAlimentacao5d");
      if (activeFilters.agua3d) keep = keep && aplicarFiltro(c, "agua3d");
      if (activeFilters.treino2m) keep = keep && aplicarFiltro(c, "treino2m");
      if (activeFilters.fazerCheckin) keep = keep && (c.dueStatus === "today" || c.dueStatus === "overdue");
      return keep;
    });
  }, [clientes, search, activeFilters]);

  function toggleFilter(key: FilterKey) {
    setActiveFilters((prev) => {
      let next = { ...prev, [key]: !prev[key] } as typeof prev;
      if (key === "semFiltro") {
        const enabled = next.semFiltro;
        if (enabled) {
          next = {
            ...next,
            inativos4d: false,
            semTreino5d: false,
            semAlimentacao5d: false,
            agua3d: false,
            treino2m: false,
            fazerCheckin: false,
            contaInativa: false,
          };
        }
      }
      const someSpecific =
        next.inativos4d ||
        next.semTreino5d ||
        next.semAlimentacao5d ||
        next.agua3d ||
        next.treino2m ||
        next.fazerCheckin ||
        next.contaInativa;
      next.semFiltro = !someSpecific;
      return next;
    });
  }

  if (!ready) return <div className="p-6 text-sm text-muted-foreground">A iniciar sessão…</div>;
  if (!uid) return <div className="p-6 text-sm text-destructive">Precisas de iniciar sessão para aceder.</div>;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard do Coach</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchClientes} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Atualizar
          </Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-70" />
              <Input
                placeholder="Pesquisar clientes por nome ou email"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  <FilterIcon className="mr-2 h-4 w-4" /> Filtros
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Conjuntos rápidos</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={activeFilters.semFiltro}
                  onCheckedChange={() => toggleFilter("semFiltro")}
                >
                  Sem filtro específico
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Condiç��es</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={activeFilters.inativos4d}
                  onCheckedChange={() => toggleFilter("inativos4d")}
                >
                  Inativos há ≥ 4 dias (sem daily)
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={activeFilters.semTreino5d}
                  onCheckedChange={() => toggleFilter("semTreino5d")}
                >
                  Sem treino há ≥ 5 dias
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={activeFilters.semAlimentacao5d}
                  onCheckedChange={() => toggleFilter("semAlimentacao5d")}
                >
                  Sem alimentação 100% há ≥ 5 dias
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={activeFilters.agua3d}
                  onCheckedChange={() => toggleFilter("agua3d")}
                >
                  Sem meta de água há ≥ 3 dias
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={activeFilters.treino2m}
                  onCheckedChange={() => toggleFilter("treino2m")}
                >
                  Treino desatualizado há ≥ 2 meses
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={activeFilters.fazerCheckin}
                  onCheckedChange={() => toggleFilter("fazerCheckin")}
                >
                  Fazer Check-in (hoje ou em atraso)
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Conta</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={activeFilters.contaInativa}
                  onCheckedChange={() => toggleFilter("contaInativa")}
                >
                  Inativos (conta desativada)
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <Link key={c.id} href={`/coach/client/${c.id}`} className="group block cursor-pointer">
            <Card className={cn(
              "shadow-sm hover:shadow-md transition",
              (c.dueStatus === "overdue" || c.dueStatus === "today") && "bg-[#FFE3B3] ring-2 ring-[#B97100] text-[#B97100]"
            )}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="block truncate font-semibold group-hover:underline">
                      {c.nome}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.email ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end max-w-full">
                    {c.dueStatus && (
                      <Badge variant={c.dueStatus === "overdue" ? "destructive" : "secondary"}>
                        {c.dueStatus === "overdue" ? "CI em atraso" : "CI hoje"}
                      </Badge>
                    )}
                    {typeof c.diasDesdeUltimoDF === "number" && (
                      <Badge variant={c.diasDesdeUltimoDF >= 4 ? "destructive" : "default"}>
                        Últ. registo: {c.diasDesdeUltimoDF}d
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <Separator />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Metric label="Sem treino" valueDays={c.diasSemTreinar} warnAt={5} />
                  <Metric label="Sem alim. 100%" valueDays={c.diasSemAlimentacaoOK} warnAt={5} />
                  <Metric label="Sem água OK" valueDays={c.diasSemAguaOK} warnAt={3} />
                  <Metric label="Meta água (L)" value={c.metaAguaLitros.toFixed(2)} />
                </div>

                {c.ultimoDF && (
                  <div className="text-xs text-muted-foreground">
                    Último DF: {c.ultimoDF?.date ? formatLisbonDate(toDate(c.ultimoDF.date)!, { dateStyle: "short" }) : "—"} • Treinou: {String(c.ultimoDF?.didWorkout ?? "?")}
                    {typeof c.ultimoDF?.waterLiters === "number" && ` • Água: ${c.ultimoDF?.waterLiters}L`}
                    {typeof c.ultimoDF?.alimentacao100 === "boolean" && ` • Alimentação OK: ${c.ultimoDF?.alimentacao100 ? "Sim" : "Não"}`}
                    {(typeof c.ultimoDF?.peso === "number" || typeof c.ultimoDF?.weight === "number") &&
                      ` • Peso: ${(c.ultimoDF?.peso ?? c.ultimoDF?.weight)}kg`}
                  </div>
                )}

                {(c.dueStatus && c.phone) && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); const url = `https://wa.me/${cleanPhone(c.phone)}?text=${encodeURIComponent(`Olá ${c.nome.split(' ')[0] || ''}! Está na hora do teu check-in. Consegues marcar a avaliação? Próximo CI: ${c.nextCheckinYMD ?? '—'}.`)}`; window.open(url, "_blank", "noopener,noreferrer"); }}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                      title="Enviar WhatsApp"
                    >
                      <span>WhatsApp</span>
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Sem resultados para os filtros/pesquisa atuais.
          </CardContent>
        </Card>
      )}

      <div className="pt-2 flex justify-center">
        <Button variant="outline" onClick={() => { signOut(auth).finally(() => router.replace("/login")); }}>
          Terminar sessão
        </Button>
      </div>
    </div>
  );
}

/* Default export embrulhado no guard */
export default function Page() {
  return (
    <CoachGuard>
      <CoachDashboard />
    </CoachGuard>
  );
}

function Metric({
  label,
  valueDays,
  value,
  warnAt,
}: {
  label: string;
  valueDays?: number | null;
  value?: number | string | null;
  warnAt?: number;
}) {
  const warn =
    typeof valueDays === "number" && typeof warnAt === "number" && valueDays >= warnAt;
  return (
    <div className={cn("rounded-2xl border p-3", warn ? "border-destructive" : "border-muted")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-base font-semibold", warn && "text-destructive")}>
        {typeof valueDays === "number" ? `${valueDays}d` : value ?? "—"}
      </div>
    </div>
  );
}
