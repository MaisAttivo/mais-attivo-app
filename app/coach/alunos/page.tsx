"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, orderBy, query, Timestamp, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import CoachGuard from "@/components/ui/CoachGuard";
import { Button } from "@/components/ui/button";
import { cn, lisbonYMD, lisbonTodayYMD } from "@/lib/utils";
import { Users, CheckCircle2, CalendarClock } from "lucide-react";

type Aluno = {
  id: string;
  ativo: boolean;
  nome: string;
  numero: string | null;
  criadoEm: Date | null;
  dueStatus?: "today" | "overdue" | null;
};

function toDate(ts?: Timestamp | null): Date | null {
  return ts ? (ts.toDate ? ts.toDate() : null) : null;
}

function displayNameFrom(u: any, id: string): string {
  const n = (u?.fullName || u?.name || u?.nome || "").toString().trim();
  if (n) return n;
  const email = (u?.email || "").toString().trim();
  return email || id;
}

function extractPhone(u: any): string | null {
  const p = (u?.phone ?? u?.phoneNumber ?? u?.telefone ?? "").toString().trim();
  return p || null;
}

type StatusFilter = "all" | "active" | "inactive";

function AlunosList() {
  const [loading, setLoading] = useState<boolean>(true);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
        const base: Array<{ id: string; u: any }> = [];
        snap.forEach((d) => {
          const u: any = d.data() || {};
          const role = (u?.role || "").toString();
          if (role === "coach") return; // apenas alunos
          base.push({ id: d.id, u });
        });

        const items: Aluno[] = await Promise.all(
          base.map(async ({ id, u }) => {
            let nextCheckinYMD: string | null = null;
            try {
              const nd: Date | null = u?.nextCheckinDate?.toDate?.() ?? null;
              if (nd) nextCheckinYMD = lisbonYMD(nd);
              else if (typeof u?.nextCheckinText === "string") nextCheckinYMD = u.nextCheckinText;
            } catch {}
            if (!nextCheckinYMD) {
              try {
                const qs = await getDocs(query(collection(db, `users/${id}/checkins`), orderBy("date", "desc"), limit(1)));
                if (!qs.empty) {
                  const d: any = qs.docs[0].data();
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

            return {
              id,
              ativo: typeof u?.active === "boolean" ? Boolean(u.active) : true,
              nome: displayNameFrom(u, id),
              numero: extractPhone(u),
              criadoEm: toDate(u?.createdAt ?? null),
              dueStatus,
            } as Aluno;
          })
        );

        if (mounted) setAlunos(items);
      } catch (e) {
        if (mounted) setAlunos([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "active") return alunos.filter((a) => a.ativo !== false);
    if (statusFilter === "inactive") return alunos.filter((a) => a.ativo === false);
    return alunos;
  }, [alunos, statusFilter]);

  const stats = useMemo(() => {
    const total = alunos.length;
    const active = alunos.filter((a) => a.ativo !== false).length;
    const due = alunos.filter((a) => a.dueStatus === "today" || a.dueStatus === "overdue").length;
    return { total, active, due };
  }, [alunos]);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <h1 className="text-2xl md:text-3xl font-bold">Alunos</h1>
        <div className="flex items-center gap-2">
          <Button className="shadow-sm" variant={statusFilter === "all" ? "default" : "secondary"} onClick={() => setStatusFilter("all")}>Todos</Button>
          <Button className="shadow-sm" variant={statusFilter === "active" ? "default" : "secondary"} onClick={() => setStatusFilter("active")}>Ativos</Button>
          <Button className="shadow-sm" variant={statusFilter === "inactive" ? "default" : "secondary"} onClick={() => setStatusFilter("inactive")}>Inativos</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-2xl border p-4 bg-emerald-50 ring-1 ring-emerald-200 text-emerald-700 flex items-center justify-between">
          <div>
            <div className="text-xs">Nº Alunos Ativos</div>
            <div className="text-2xl font-bold">{stats.active}</div>
          </div>
          <CheckCircle2 className="h-6 w-6 opacity-80" />
        </div>
        <div className="rounded-2xl border p-4 bg-background shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Nº Alunos desde o Início</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <Users className="h-6 w-6 opacity-70" />
        </div>
        <div className="rounded-2xl border p-4 bg-[#FFE3B3] ring-2 ring-[#B97100] text-[#B97100] flex items-center justify-between">
          <div>
            <div className="text-xs">Nº Alunos para check‑in</div>
            <div className="text-2xl font-bold">{stats.due}</div>
          </div>
          <CalendarClock className="h-6 w-6" />
        </div>
      </div>

      <div className="rounded-2xl border bg-background overflow-hidden">
        <div className="grid grid-cols-4 gap-0 text-sm font-medium bg-muted/50 border-b">
          <div className="px-3 py-2">Check Ativo</div>
          <div className="px-3 py-2">Nome</div>
          <div className="px-3 py-2">Número</div>
          <div className="px-3 py-2">Data de Registo</div>
        </div>

        {loading ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">A carregar…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">Sem alunos.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((a) => (
              <Link
                key={a.id}
                href={`/coach/client/${a.id}`}
                className={cn(
                  "grid grid-cols-4 gap-0 items-center",
                  (a.dueStatus === "overdue" || a.dueStatus === "today") && "bg-[#FFE3B3] ring-2 ring-[#B97100] text-[#B97100]"
                )}
              >
                <div className="px-3 py-2">
                  <input type="checkbox" checked={a.ativo} readOnly className="h-4 w-4 align-middle" />
                </div>
                <div className="px-3 py-2 truncate">{a.nome}</div>
                <div className="px-3 py-2 truncate">{a.numero ?? "—"}</div>
                <div className="px-3 py-2">
                  {a.criadoEm ? a.criadoEm.toLocaleDateString("pt-PT") : "—"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <CoachGuard>
      <AlunosList />
    </CoachGuard>
  );
}
