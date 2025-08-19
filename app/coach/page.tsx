"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import CoachGuard from "@/components/ui/CoachGuard";

/* ========= Tipos ========= */
export type DailyFeedback = {
  id: string;
  date: Timestamp;
  didWorkout?: boolean | null;
  waterLiters?: number | null;
  alimentacao100?: boolean | null;
  weight?: number | null;
};

export type Cliente = {
  id: string;
  nome: string;
  email?: string;
  ultimoDF?: DailyFeedback | null;
  metaAguaLitros: number;
  diasDesdeUltimoDF?: number | null;
  diasSemTreinar?: number | null;
  diasSemAlimentacaoOK?: number | null;
  diasSemAguaOK?: number | null;
};

/* ========= Utils ========= */
function daysBetween(a: Date, b: Date) {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86400000);
}
function toDate(ts?: Timestamp | null) {
  return ts ? ts.toDate() : null;
}

/* ========= Auth helper ========= */
function useAuthReady() {
  const [state, setState] = useState<{ ready: boolean; uid: string | null }>({
    ready: false,
    uid: null,
  });
  useEffect(() => {
    return onAuthStateChanged(auth, (u) =>
      setState({ ready: true, uid: u?.uid ?? null })
    );
  }, []);
  return state;
}

/* ========= Filtros e métricas ========= */
export type FilterKey =
  | "inativos4d"
  | "semTreino5d"
  | "semAlimentacao5d"
  | "agua3d"
  | "semFiltro";

function getDerivedMetricsFromHistory(history: DailyFeedback[]) {
  const now = new Date();

  // meta de água: último weight * 0.05; se não houver, 3.0L
  let metaAgua = 3.0;
  for (const df of history) {
    if (typeof df.weight === "number") {
      metaAgua = df.weight * 0.05;
      break;
    }
  }

  const last = history[0];
  const diasDesdeUltimoDF = last?.date
    ? daysBetween(now, toDate(last.date)!)
    : Infinity;

  let diasSemTreinar = Infinity;
  for (const df of history) {
    if (df.didWorkout === true) {
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
  for (const df of history) {
    const ok = (df.waterLiters ?? 0) >= metaAgua;
    if (ok) {
      diasSemAguaOK = daysBetween(now, toDate(df.date)!);
      break;
    }
  }

  return {
    diasDesdeUltimoDF,
    diasSemTreinar,
    diasSemAlimentacaoOK,
    diasSemAguaOK,
    last,
    metaAgua,
  };
}

const filterPredicates: Record<Exclude<FilterKey, "semFiltro">, (c: Cliente) => boolean> = {
  inativos4d: (c) => (c.diasDesdeUltimoDF ?? Infinity) >= 4,
  semTreino5d: (c) => (c.diasSemTreinar ?? Infinity) >= 5,
  semAlimentacao5d: (c) => (c.diasSemAlimentacaoOK ?? Infinity) >= 5,
  agua3d: (c) => (c.diasSemAguaOK ?? Infinity) >= 3,
};

/* ========= Página ========= */
function CoachDashboard() {
  const { ready, uid } = useAuthReady();

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
      const usersRef = collection(db, "users");

      // Canon: role === "client"; fallback temporário para "cliente"
      let snap = await getDocs(query(usersRef, where("role", "==", "client")));
      if (snap.empty) {
        const alt = await getDocs(query(usersRef, where("role", "==", "cliente")));
        if (!alt.empty) snap = alt;
      }

      if (snap.empty) {
        setClientes([]);
        return;
      }

      const base = snap.docs.map((d) => ({
        id: d.id,
        nome: d.get("nome") ?? "Sem nome",
        email: d.get("email") ?? undefined,
      }));

      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const enriched = await Promise.all(
        base.map(async (c) => {
          const dfRef = collection(db, `users/${c.id}/dailyFeedback`);
          const qDF = query(
            dfRef,
            where("date", ">=", Timestamp.fromDate(twoWeeksAgo)),
            orderBy("date", "desc"),
            limit(30)
          );
          const dfSnap = await getDocs(qDF);

          const history: DailyFeedback[] = dfSnap.docs.map((d) => ({
            id: d.id,
            date: d.get("date"),
            didWorkout: d.get("didWorkout") ?? null,
            waterLiters: d.get("waterLiters") ?? null,
            alimentacao100: d.get("alimentacao100") ?? null,
            weight: d.get("weight") ?? null,
          }));

          // fallback: se não houver nos últimos 14 dias, busca o último
          if (history.length === 0) {
            const lastSnap = await getDocs(query(dfRef, orderBy("date", "desc"), limit(1)));
            lastSnap.forEach((d) =>
              history.push({
                id: d.id,
                date: d.get("date"),
                didWorkout: d.get("didWorkout") ?? null,
                waterLiters: d.get("waterLiters") ?? null,
                alimentacao100: d.get("alimentacao100") ?? null,
                weight: d.get("weight") ?? null,
              })
            );
          }

          const m = getDerivedMetricsFromHistory(history);
          return {
            ...c,
            ultimoDF: m.last ?? null,
            metaAguaLitros: m.metaAgua,
            diasDesdeUltimoDF: Number.isFinite(m.diasDesdeUltimoDF) ? m.diasDesdeUltimoDF : null,
            diasSemTreinar: Number.isFinite(m.diasSemTreinar) ? m.diasSemTreinar : null,
            diasSemAlimentacaoOK: Number.isFinite(m.diasSemAlimentacaoOK) ? m.diasSemAlimentacaoOK : null,
            diasSemAguaOK: Number.isFinite(m.diasSemAguaOK) ? m.diasSemAguaOK : null,
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

  if (!ready) {
    return <div className="p-6 text-sm text-muted-foreground">A iniciar sessão…</div>;
  }
  if (!uid) {
    return <div className="p-6 text-sm text-destructive">Precisas de iniciar sessão para aceder.</div>;
  }

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
          <Card key={c.id} className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="truncate pr-2">{c.nome}</span>
                <div className="flex items-center gap-2">
                  {c.diasDesdeUltimoDF != null && (
                    <Badge variant={c.diasDesdeUltimoDF >= 4 ? "destructive" : "default"}>
                      Últ. registo: {c.diasDesdeUltimoDF}d
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground truncate">
                {c.email ?? "—"}
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Metric label="Sem treino" valueDays={c.diasSemTreinar} warnAt={5} />
                <Metric label="Sem alim. 100%" valueDays={c.diasSemAlimentacaoOK} warnAt={5} />
                <Metric label="Sem água OK" valueDays={c.diasSemAguaOK} warnAt={3} />
                <Metric label="Meta água (L)" value={c.metaAguaLitros.toFixed(2)} />
              </div>

              {c.ultimoDF && (
                <div className="text-xs text-muted-foreground">
                  Último DF: {toDate(c.ultimoDF.date)?.toLocaleDateString()} • Treinou: {String(c.ultimoDF.didWorkout ?? "?")}
                  {typeof c.ultimoDF.waterLiters === "number" && ` • Água: ${c.ultimoDF.waterLiters}L`}
                  {typeof c.ultimoDF.alimentacao100 === "boolean" && ` • Alimentação OK: ${c.ultimoDF.alimentacao100 ? "Sim" : "Não"}`}
                  {typeof c.ultimoDF.weight === "number" && ` • Peso: ${c.ultimoDF.weight}kg`}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Sem resultados para os filtros/pesquisa atuais.
          </CardContent>
        </Card>
      )}
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
