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
  ultimoDF?: DailyFeedback | null;
  metaAguaLitros: number;
  diasDesdeUltimoDF?: number | null;
  diasSemTreinar?: number | null;
  diasSemAlimentacaoOK?: number | null;
  diasSemAguaOK?: number | null;
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

const filterPredicates: Record<Exclude<FilterKey, "semFiltro">, (c: Cliente) => boolean> = {
  inativos4d: (c) => (c.diasDesdeUltimoDF ?? Infinity) >= 4,
  semTreino5d: (c) => (c.diasSemTreinar ?? Infinity) >= 5,
  semAlimentacao5d: (c) => (c.diasSemAlimentacaoOK ?? Infinity) >= 5,
  agua3d: (c) => (c.diasSemAguaOK ?? Infinity) >= 3,
};

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
    let qQ = query(collection(db, `users/${userId}/questionnaire`), orderBy("createdAt", "desc"), limit(1));
    let snap = await getDocs(qQ);
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
    let qQ = query(collection(db, `users/${userId}/questionnaire`), orderBy("createdAt", "desc"), limit(1));
    let s = await getDocs(qQ);
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
  });

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

          return {
            id: u.id,
            nome: nomeFinal,
            email: u.email,
            ultimoDF: m.last ?? null,
            metaAguaLitros: metaAgua,
            diasDesdeUltimoDF: Number.isFinite(m.diasDesdeUltimoDF) ? m.diasDesdeUltimoDF : null,
            diasSemTreinar: Number.isFinite(m.diasSemTreinar) ? m.diasSemTreinar : null,
            diasSemAlimentacaoOK: Number.isFinite(m.diasSemAlimentacaoOK) ? m.diasSemAlimentacaoOK : null,
            diasSemAguaOK: Number.isFinite(m.diasSemAguaOK) ? m.diasSemAguaOK : null,
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

    const anySpecific = Object.entries(activeFilters).some(([k, v]) => k !== "semFiltro" && v);
    if (!anySpecific) return list;

    return list.filter((c) => {
      let keep = true;
      if (activeFilters.inativos4d) keep = keep && filterPredicates.inativos4d(c);
      if (activeFilters.semTreino5d) keep = keep && filterPredicates.semTreino5d(c);
      if (activeFilters.semAlimentacao5d) keep = keep && filterPredicates.semAlimentacao5d(c);
      if (activeFilters.agua3d) keep = keep && filterPredicates.agua3d(c);
      return keep;
    });
  }, [clientes, search, activeFilters]);

  function toggleFilter(key: FilterKey) {
    setActiveFilters((prev) => {
      const next = { ...prev, [key]: !prev[key] } as typeof prev;
      const someSpecific = next.inativos4d || next.semTreino5d || next.semAlimentacao5d || next.agua3d;
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
                <DropdownMenuLabel>Condições</DropdownMenuLabel>
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
              c.dueStatus === "overdue" && "border-destructive",
              c.dueStatus === "today" && "border-primary"
            )}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="block truncate font-semibold group-hover:underline">
                      {c.nome}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.email ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
