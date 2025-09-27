"use client";

import React, { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import CoachGuard from "@/components/ui/CoachGuard";

type Aluno = {
  id: string;
  ativo: boolean;
  nome: string;
  numero: string | null;
  criadoEm: Date | null;
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

function AlunosList() {
  const [loading, setLoading] = useState<boolean>(true);
  const [alunos, setAlunos] = useState<Aluno[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
        const items: Aluno[] = [];
        snap.forEach((d) => {
          const u: any = d.data() || {};
          const role = (u?.role || "").toString();
          if (role === "coach") return; // apenas alunos
          items.push({
            id: d.id,
            ativo: typeof u?.active === "boolean" ? Boolean(u.active) : true,
            nome: displayNameFrom(u, d.id),
            numero: extractPhone(u),
            criadoEm: toDate(u?.createdAt ?? null),
          });
        });
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

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl md:text-3xl font-bold mb-4">Alunos</h1>

      <div className="rounded-2xl border bg-background overflow-hidden">
        <div className="grid grid-cols-4 gap-0 text-sm font-medium bg-muted/50 border-b">
          <div className="px-3 py-2">Check Ativo</div>
          <div className="px-3 py-2">Nome</div>
          <div className="px-3 py-2">Número</div>
          <div className="px-3 py-2">Data de Registo</div>
        </div>

        {loading ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">A carregar…</div>
        ) : alunos.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">Sem alunos.</div>
        ) : (
          <div className="divide-y">
            {alunos.map((a) => (
              <div key={a.id} className="grid grid-cols-4 gap-0 items-center">
                <div className="px-3 py-2">
                  <input type="checkbox" checked={a.ativo} readOnly className="h-4 w-4 align-middle" />
                </div>
                <div className="px-3 py-2 truncate">{a.nome}</div>
                <div className="px-3 py-2 truncate">{a.numero ?? "—"}</div>
                <div className="px-3 py-2">
                  {a.criadoEm ? a.criadoEm.toLocaleDateString("pt-PT") : "—"}
                </div>
              </div>
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
