"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  query,
  where,
  documentId, // 👈 aqui
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type Row = {
  id: string;
  name?: string;
  email?: string;
  nextCheckin?: string | null; // users/{id}.nextCheckinDate (cache)
  dailyDone: boolean;
  weeklyDone: boolean;
};

function ymdUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}
function isoWeekYear(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}
function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function yearWeekIdUTC(d = new Date()) {
  const y = isoWeekYear(d);
  const w = String(isoWeekNumber(d)).padStart(2, "0");
  return `${y}-W${w}`;
}

export default function ClientesPage() {
  const [isCoach, setIsCoach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");

  // Auth + claims
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setIsCoach(false);
        setLoading(false);
        return;
      }
      const token = await u.getIdTokenResult();
      setIsCoach(!!(token.claims.coach || token.claims.role === "coach"));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isCoach) return;

    (async () => {
      // 1) Buscar clientes (até 500) e ler o cache nextCheckinDate
      const usersCol = collection(db, "users");
      const attempts = [
        query(usersCol, where("tipo", "==", "cliente"), limit(500)),
        query(usersCol, where("role", "==", "cliente"), limit(500)),
        query(usersCol, where("type", "==", "cliente"), limit(500)),
      ];

      let base: Row[] = [];
      for (const qUsers of attempts) {
        try {
          const snap = await getDocs(qUsers);
          if (!snap.empty) {
            base = snap.docs.map((d) => {
              const data: any = d.data();
              return {
                id: d.id,
                name: data.nome || data.name,
                email: data.email,
                nextCheckin: data.nextCheckinDate || null,
                dailyDone: false,
                weeklyDone: false,
              };
            });
            break;
          }
        } catch {}
      }

      if (base.length === 0) {
        const snap = await getDocs(query(usersCol, limit(500)));
        base = snap.docs
          .map((d) => {
            const data: any = d.data();
            return {
              id: d.id,
              name: data.nome || data.name,
              email: data.email,
              nextCheckin: data.nextCheckinDate || null,
              _tipo: (data.tipo || data.role || data.type || "").toLowerCase(),
              dailyDone: false,
              weeklyDone: false,
            } as any;
          })
          .filter((u: any) => u._tipo === "cliente")
          .map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            nextCheckin: u.nextCheckin,
            dailyDone: false,
            weeklyDone: false,
          }));
      }

      if (base.length === 0) {
        setRows([]);
        return;
      }

      const clientIds = new Set(base.map((b) => b.id));
      const byId = new Map<string, Row>();
      base.forEach((b) => byId.set(b.id, { ...b }));

      // 2) Daily hoje (1 collectionGroup)
      const todayId = ymdUTC(new Date());
      try {
        const cgDaily = query(
          collectionGroup(db, "dailyFeedback"),
          where(documentId(), "==", todayId) // 👈 aqui
        );
        const dailySnap = await getDocs(cgDaily);
        dailySnap.forEach((d) => {
          const userId = d.ref.parent.parent?.id;
          if (userId && clientIds.has(userId)) {
            byId.get(userId)!.dailyDone = true;
          }
        });
      } catch {}

      // 3) Weekly semana atual (1 collectionGroup)
      const weekId = yearWeekIdUTC(new Date());
      try {
        const cgWeekly = query(
          collectionGroup(db, "weeklyFeedback"),
          where(documentId(), "==", weekId) // 👈 aqui
        );
        const weeklySnap = await getDocs(cgWeekly);
        weeklySnap.forEach((d) => {
          const userId = d.ref.parent.parent?.id;
          if (userId && clientIds.has(userId)) {
            byId.get(userId)!.weeklyDone = true;
          }
        });
      } catch {}

      const finalRows = Array.from(byId.values()).sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );
      setRows(finalRows);
    })().catch((e) => console.error("Erro a carregar clientes:", e));
  }, [isCoach]);

  if (loading) return <div className="p-4">A carregar…</div>;
  if (!isCoach) return <div className="p-4">Acesso reservado a coaches.</div>;

  const filtered = rows.filter((r) => {
    const t = filter.trim().toLowerCase();
    if (!t) return true;
    return (
      (r.name || "").toLowerCase().includes(t) ||
      (r.email || "").toLowerCase().includes(t) ||
      r.id.toLowerCase().includes(t)
    );
  });

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <input
          type="text"
          placeholder="Procurar por nome, email ou ID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border rounded-xl px-3 py-2 w-full"
        />
      </header>

      <div className="overflow-auto rounded-xl border">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Nome</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Próximo check-in</th>
              <th className="text-left px-3 py-2">Daily (hoje)</th>
              <th className="text-left px-3 py-2">Weekly (semana)</th>
              <th className="text-right px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">Sem clientes.</td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">{c.name || "(Sem nome)"}</td>
                <td className="px-3 py-2">{c.email || "—"}</td>
                <td className="px-3 py-2">{c.nextCheckin || "—"}</td>
                <td className="px-3 py-2">{c.dailyDone ? "✅" : "⛔"}</td>
                <td className="px-3 py-2">{c.weeklyDone ? "✅" : "⛔"}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/checkins/${c.id}`} className="px-3 py-1 rounded-xl border hover:shadow">
                    Abrir check-ins
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        “Próximo check-in” vem do cache em <code>users/{"{id}"}.nextCheckinDate</code>
.  
        Daily = doc <code>dailyFeedback/{"{YYYY-MM-DD}"}</code> (UTC). Weekly = <code>weeklyFeedback/{"{YYYY-WW}"}</code> (ISO).
      </p>
    </div>
  );
}
