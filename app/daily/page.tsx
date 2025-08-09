"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// ID da data no fuso local do utilizador (YYYY-MM-DD)
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
  const [didCardio, setDidCardio] = useState(false); // checkbox -> string ao guardar
  const [food100, setFood100] = useState(false);     // alimentacao100
  const [notes, setNotes] = useState("");

  // Metadados para regra de 2h
  const [docDate, setDocDate] = useState<Date | null>(null);        // date salvo no doc (não pode mudar no update)
  const [createdAt, setCreatedAt] = useState<Date | null>(null);    // para janela de edição
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState("");

  const canEdit =
    alreadySubmitted &&
    !!createdAt &&
    Date.now() < createdAt.getTime() + 2 * 60 * 60 * 1000; // 2h

  // Autenticação + carregar registo de hoje (se existir)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);

      const ref = doc(db, `users/${user.uid}/dailyFeedback/${todayId}`);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as any;

        // ler pelos nomes padronizados (com retrocompat)
        setWeightKg(
          typeof data.peso === "number"
            ? data.peso
            : typeof data.weightKg === "number"
            ? data.weightKg
            : ""
        );
        setWaterLiters(
          typeof data.aguaLitros === "number"
            ? data.aguaLitros
            : typeof data.waterLiters === "number"
            ? data.waterLiters
            : ""
        );
        setSteps(
          typeof data.passos === "number"
            ? data.passos
            : typeof data.steps === "number"
            ? data.steps
            : ""
        );
        setTrained(Boolean(data.treinou ?? data.trained));
        const cardioStr: string =
          typeof data.cardio === "string"
            ? data.cardio
            : data.cardio === true
            ? "sim"
            : "";
        setDidCardio(cardioStr === "sim");
        setFood100(Boolean(data.alimentacao100));
        setNotes(data.outraAtividade ?? data.notes ?? "");

        // metadados
        setDocDate(data.date?.toDate?.() || null);
        setCreatedAt(data.createdAt?.toDate?.() || null);
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

      if (!alreadySubmitted) {
        // CREATE — envia date atual e createdAt (regras exigem)
        await setDoc(
          ref,
          {
            date: new Date(),              // timestamp
            createdAt: serverTimestamp(),  // janela de 2h
            peso: Number(weightKg) || 0,
            aguaLitros: Number(waterLiters) || 0,
            passos: Number(steps) || 0,
            treinou: !!trained,
            alimentacao100: !!food100,
            cardio: didCardio ? "sim" : "",   // string
            outraAtividade: notes.trim(),
          },
          { merge: false }
        );
        setSavedMsg("Feedback diário guardado ✅");
        setAlreadySubmitted(true);
        // Para permitir edição imediata na UI (sem recarregar), define createdAt agora
        setCreatedAt(new Date());
        setDocDate(new Date());
      } else {
        // UPDATE — só se canEdit; mantém 'date' exatamente igual ao salvo
        if (!canEdit || !docDate) {
          setError("Já não é possível editar (janela de 2 horas expirada).");
          setSubmitting(false);
          return;
        }
        await setDoc(
          ref,
          {
            // IMPORTANTÍSSIMO: enviar o MESMO 'date' do doc original
            date: docDate,
            // NÃO enviar createdAt no update
            peso: Number(weightKg) || 0,
            aguaLitros: Number(waterLiters) || 0,
            passos: Number(steps) || 0,
            treinou: !!trained,
            alimentacao100: !!food100,
            cardio: didCardio ? "sim" : "",
            outraAtividade: notes.trim(),
          },
          { merge: true }
        );
        setSavedMsg("Alterações guardadas ✅");
      }
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

      {alreadySubmitted && !canEdit && (
        <div className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-green-800">
          Já submeteste o feedback de hoje. A edição esteve disponível por 2 horas.
        </div>
      )}

      {alreadySubmitted && canEdit && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-amber-800">
          Podes editar o diário de hoje (janela de 2 horas).
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
            disabled={alreadySubmitted && !canEdit}
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
              disabled={alreadySubmitted && !canEdit}
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
              disabled={alreadySubmitted && !canEdit}
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
                disabled={alreadySubmitted && !canEdit}
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
                checked={didCardio}
                onChange={(e) => setDidCardio(e.target.checked)}
                disabled={alreadySubmitted && !canEdit}
              />
              <label htmlFor="cardio">Sim</label>
            </div>
          </div>
        </div>

        <div>
          <label className="block font-medium mb-1">Alimentação 100%?</label>
          <div className="flex items-center gap-3">
            <input
              id="food100"
              type="checkbox"
              checked={food100}
              onChange={(e) => setFood100(e.target.checked)}
              disabled={alreadySubmitted && !canEdit}
            />
            <label htmlFor="food100">Sim</label>
          </div>
        </div>

        <div>
          <label className="block font-medium mb-1">Notas (opcional)</label>
          <textarea
            placeholder="Como correu o dia?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border rounded p-2 min-h-[90px]"
            disabled={alreadySubmitted && !canEdit}
          />
        </div>

        {error && <p className="text-red-600">{error}</p>}
        {savedMsg && <p className="text-green-700">{savedMsg}</p>}

        <button
          type="submit"
          disabled={submitting || (alreadySubmitted && !canEdit)}
          className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? "A enviar..." : alreadySubmitted ? "Guardar alterações" : "Enviar feedback de hoje"}
        </button>
      </form>
    </main>
  );
}
