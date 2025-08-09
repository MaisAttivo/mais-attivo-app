"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

// util: soma 21 dias
function plusDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export default function CheckinsUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const [isCoach, setIsCoach] = useState(false);
  const [loading, setLoading] = useState(true);

  // form
  const [date, setDate] = useState<string>(""); // yyyy-mm-dd
  const [type, setType] = useState<"online" | "presencial">("online");
  const [commentPublic, setCommentPublic] = useState("");

  // NOVOS CAMPOS
  const [peso, setPeso] = useState<number | "">("");
  const [massaMuscular, setMassaMuscular] = useState<number | "">("");
  const [massaGorda, setMassaGorda] = useState<number | "">("");

  const [submitting, setSubmitting] = useState(false);

  // últimos check-ins (mostrar lista curta)
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setLoading(false);
        return;
      }
      // claim coach
      const token = await u.getIdTokenResult(true);
      setIsCoach(!!(token.claims?.coach || token.claims?.role === "coach"));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // carregar últimos 5 check-ins
  useEffect(() => {
    (async () => {
      if (!userId) return;
      const q = query(
        collection(db, `users/${userId}/checkins`),
        orderBy("date", "desc"),
        limit(5)
      );
      const snap = await getDocs(q);
      const rows: any[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      setRecent(rows);
    })();
  }, [userId]);

  async function handleSubmit() {
    if (!isCoach || !userId || !date) return;
    setSubmitting(true);
    try {
      // converter a data do input (yyyy-mm-dd) para Timestamp
      const [Y, M, D] = date.split("-").map(Number);
      const d = Timestamp.fromDate(new Date(Date.UTC(Y, (M ?? 1) - 1, D ?? 1)));
      const next = Timestamp.fromDate(plusDays(d.toDate(), 21));

      // cria check-in
      const ref = await addDoc(collection(db, `users/${userId}/checkins`), {
        date: d,
        nextDate: next,
        type,
        commentPublic: commentPublic.trim(),
        createdAt: serverTimestamp(),
        // novos
        peso: typeof peso === "string" ? 0 : (peso || 0),
        massaMuscular: typeof massaMuscular === "string" ? 0 : (massaMuscular || 0),
        massaGorda: typeof massaGorda === "string" ? 0 : (massaGorda || 0),
      });

      // atualiza cache no user
      await updateDoc(doc(db, "users", userId), {
        lastCheckinDate: date,
        nextCheckinDate: next.toDate().toISOString().slice(0, 10),
      });

      // reset ui
      setCommentPublic("");
      setPeso("");
      setMassaMuscular("");
      setMassaGorda("");
      setDate("");

      // atualiza lista
      const q = query(
        collection(db, `users/${userId}/checkins`),
        orderBy("date", "desc"),
        limit(5)
      );
      const snap = await getDocs(q);
      const rows: any[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      setRecent(rows);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-4">A carregar…</div>;
  if (!isCoach) return <div className="p-4">Apenas o coach pode registar check-ins.</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Check-ins — {userId}</h1>

      <div className="space-y-3 border rounded-2xl p-4">
        <h2 className="font-medium">Novo check-in</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded-xl px-3 py-2 w-full"
            />
          </div>
          <div>
            <label className="text-sm">Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="border rounded-xl px-3 py-2 w-full"
            >
              <option value="online">online</option>
              <option value="presencial">presencial</option>
            </select>
          </div>
        </div>

        {/* NOVOS CAMPOS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">Peso (kg)</label>
            <input
              type="number"
              step="0.1"
              value={peso}
              onChange={(e) => setPeso((e.target as HTMLInputElement).value as any)}
              className="border rounded-xl px-3 py-2 w-full"
              placeholder="ex: 74.2"
            />
          </div>
          <div>
            <label className="text-sm">Massa muscular (kg)</label>
            <input
              type="number"
              step="0.1"
              value={massaMuscular}
              onChange={(e) =>
                setMassaMuscular((e.target as HTMLInputElement).value as any)
              }
              className="border rounded-xl px-3 py-2 w-full"
              placeholder="ex: 34.7"
            />
          </div>
          <div>
            <label className="text-sm">Massa gorda (kg)</label>
            <input
              type="number"
              step="0.1"
              value={massaGorda}
              onChange={(e) =>
                setMassaGorda((e.target as HTMLInputElement).value as any)
              }
              className="border rounded-xl px-3 py-2 w-full"
              placeholder="ex: 15.3"
            />
          </div>
        </div>

        <div>
          <label className="text-sm">Comentário (público)</label>
          <textarea
            value={commentPublic}
            onChange={(e) => setCommentPublic(e.target.value)}
            className="border rounded-xl px-3 py-2 w-full min-h-[80px]"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || !date}
          className="px-4 py-2 rounded-xl border shadow disabled:opacity-50"
        >
          {submitting ? "A guardar…" : "Guardar check-in"}
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Últimos check-ins</h2>
        <ul className="space-y-2">
          {recent.map((c) => (
            <li key={c.id} className="border rounded-xl p-3 text-sm">
              <div><b>Data:</b> {c.date?.toDate?.().toISOString().slice(0,10) ?? "—"}</div>
              <div><b>Peso:</b> {c.peso ?? "—"} kg</div>
              <div><b>MM:</b> {c.massaMuscular ?? "—"} kg | <b>MG:</b> {c.massaGorda ?? "—"} kg</div>
              <div><b>Tipo:</b> {c.type ?? "—"}</div>
              <div><b>Comentário:</b> {c.commentPublic ?? "—"}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
