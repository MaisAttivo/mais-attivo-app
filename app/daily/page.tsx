"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// Converte a data local do utilizador para ID YYYY-MM-DD (sem timezone bugs)
function getLocalDateId(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DailyPage() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const todayId = useMemo(() => getLocalDateId(), []);

  // Estado do formulário
  const [weightKg, setWeightKg] = useState<number | "">("");
  const [waterLiters, setWaterLiters] = useState<number | "">("");
  const [steps, setSteps] = useState<number | "">("");
  const [trained, setTrained] = useState(false);
  const [cardio, setCardio] = useState(false);
  const [notes, setNotes] = useState("");

  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState("");

  // Autenticação + carregar registo de hoje (se existir)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);

      // Verifica se já existe daily de hoje
      const ref = doc(db, `users/${user.uid}/dailyFeedback/${todayId}`);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as any;
        setWeightKg(data.weightKg ?? "");
        setWaterLiters(data.waterLiters ?? "");
        setSteps(data.steps ?? "");
        setTrained(Boolean(data.trained));
        setCardio(Boolean(data.cardio));
        setNotes(data.notes ?? "");
        setAlreadySubmitted(true);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [router, todayId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;

    setError(null);
    setSavedMsg("");
    setSubmitting(true);

    try {
      const ref = doc(db, `users/${uid}/dailyFeedback/${todayId}`);
      // Criar o documento do dia (1 por dia)
      await setDoc(ref, {
        dateId: todayId,
        weightKg: Number(weightKg) || 0,
        waterLiters: Number(waterLiters) || 0,
        steps: Number(steps) || 0,
        trained,
        cardio,
        notes: notes.trim(),
        createdAt: serverTimestamp(),
      }, { merge: false }); // não permitir "merge" para alinhar com regra de 1 por dia

      setSavedMsg("Feedback diário guardado ✅");
      setAlreadySubmitted(true); // bloqueia o formulário
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Falha ao guardar o feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-center mt-10">A carregar…</p>;
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2 text-center">Feedback Diário</h1>
      <p className="text-center text-sm text-gray-600 mb-6">{todayId}</p>

      {alreadySubmitted && (
        <div className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-green-800">
          Já submeteste o feedback de hoje. (1 por dia)
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block font-medium mb-1">Peso (kg)</label>
          <input
            type="number"
            step="0.1"
            placeholder="Ex: 74.5"
            value={weightKg}
            onChange={(e) => setWeightKg((e.target as HTMLInputElement).value as any)}
            className="w-full border rounded p-2"
            disabled={alreadySubmitted}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-medium mb-1">Água (L)</label>
            <input
              type="number"
              step="0.1"
              placeholder="Ex: 2.5"
              value={waterLiters}
              onChange={(e) => setWaterLiters((e.target as HTMLInputElement).value as any)}
              className="w-full border rounded p-2"
              disabled={alreadySubmitted}
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Passos</label>
            <input
              type="number"
              placeholder="Ex: 8000"
              value={steps}
              onChange={(e) => setSteps((e.target as HTMLInputElement).value as any)}
              className="w-full border rounded p-2"
              disabled={alreadySubmitted}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-medium mb-1">Treinou?</label>
            <div className="flex items-center gap-3">
              <input
                id="trained"
                type="checkbox"
                checked={trained}
                onChange={(e) => setTrained(e.target.checked)}
                disabled={alreadySubmitted}
              />
              <label htmlFor="trained">Sim</label>
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Fez cardio?</label>
            <div className="flex items-center gap-3">
              <input
                id="cardio"
                type="checkbox"
                checked={cardio}
                onChange={(e) => setCardio(e.target.checked)}
                disabled={alreadySubmitted}
              />
              <label htmlFor="cardio">Sim</label>
            </div>
          </div>
        </div>

        <div>
          <label className="block font-medium mb-1">Notas (opcional)</label>
          <textarea
            placeholder="Como correu o dia?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border rounded p-2 min-h-[90px]"
            disabled={alreadySubmitted}
          />
        </div>

        {error && <p className="text-red-600">{error}</p>}
        {savedMsg && <p className="text-green-700">{savedMsg}</p>}

        <button
          type="submit"
          disabled={alreadySubmitted || submitting}
          className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? "A enviar..." : "Enviar feedback de hoje"}
        </button>
      </form>
    </main>
  );
}
