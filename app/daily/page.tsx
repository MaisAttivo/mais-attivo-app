"use client";

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { lisbonYMD } from "@/lib/utils";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// ID da data no fuso de Portugal (YYYY-MM-DD)
function getLocalDateId(d = new Date()) {
  return lisbonYMD(d);
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
  const [didCardio, setDidCardio] = useState(false);
  const [food100, setFood100] = useState(false);
  const [notes, setNotes] = useState("");

  // Metadados para regra de 2h
  const [docDate, setDocDate] = useState<Date | null>(null);
  const [createdAt, setCreatedAt] = useState<Date | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  const [hasConsent, setHasConsent] = useState<boolean>(true);
  const [consentChecked, setConsentChecked] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState("");

  const canEdit =
    alreadySubmitted &&
    !!docDate;

  // Autenticação + carregar registo de hoje (se existir)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);

      try {
        const uSnap = await getDoc(doc(db, "users", user.uid));
        const data: any = uSnap.exists() ? uSnap.data() : {};
        const consent = !!(data?.healthConsentAt || data?.healthDataConsentAt || (data?.healthDataExplicitConsent === true));
        setHasConsent(consent);
      } catch {}

      try {
        const ref = doc(db, `users/${user.uid}/dailyFeedback/${todayId}`);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as any;

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
            typeof data.cardio === "string" ? data.cardio : data.cardio === true ? "sim" : "";
          setDidCardio(cardioStr === "sim");
          setFood100(Boolean(data.alimentacao100));
          setNotes(data.outraAtividade ?? data.notes ?? "");

          setDocDate(data.date?.toDate?.() || null);
          setCreatedAt(data.createdAt?.toDate?.() || null);
          setAlreadySubmitted(true);
        }
      } catch (e) {
        console.warn("Daily load error:", e);
      } finally {
        setLoading(false);
      }
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
      // se faltar consentimento, recolhe-o agora
      if (!hasConsent) {
        if (!consentChecked) {
          setError("Confirma o consentimento para tratamento de dados de saúde.");
          setSubmitting(false);
          return;
        }
        try {
          await updateDoc(doc(db, "users", uid), {
            healthConsentAt: serverTimestamp(),
            healthDataConsentAt: serverTimestamp(),
            healthDataExplicitConsent: true,
            updatedAt: serverTimestamp(),
            active: true,
          });
          setHasConsent(true);
        } catch (e) {
          setError("Não foi possível registar o consentimento. Tenta novamente.");
          setSubmitting(false);
          return;
        }
      }

      const ref = doc(db, `users/${uid}/dailyFeedback/${todayId}`);

      if (!alreadySubmitted) {
        // CREATE — regras exigem 'date' e 'createdAt'
        await setDoc(
          ref,
          {
            date: new Date(),
            createdAt: serverTimestamp(),
            peso: Number(weightKg) || 0,
            aguaLitros: Number(waterLiters) || 0,
            passos: Number(steps) || 0,
            treinou: !!trained,
            alimentacao100: !!food100,
            cardio: didCardio ? "sim" : "",
            outraAtividade: notes.trim(),
          },
          { merge: false }
        );
        setSavedMsg("Feedback diário guardado ✅");
        setAlreadySubmitted(true);
        setCreatedAt(new Date());
        setDocDate(new Date());
      } else {
        // UPDATE — manter 'date' igual
        if (!canEdit || !docDate) {
          setError("Não é possível editar este registo.");
          setSubmitting(false);
          return;
        }
        await setDoc(
          ref,
          {
            date: docDate,
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

      // Atualiza metaAgua em users (5% do peso do daily, se houver)
      const nWeight = Number(weightKg);
      if (Number.isFinite(nWeight) && nWeight > 0) {
        const metaAgua = Number((nWeight * 0.05).toFixed(2));
        await updateDoc(doc(db, "users", uid), {
          metaAgua,
          updatedAt: serverTimestamp(),
        });
      }

      router.replace("/dashboard");
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
    <main className="relative max-w-xl mx-auto p-6 pb-24">
      {/* BACK (topo) */}
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard"><ArrowLeft className="h-4 w-4" />Voltar à dashboard</Link>
        </Button>
      </div>

      <h1 className="text-3xl font-bold mb-2 text-center">Feedback Diário</h1>
      <p className="text-center text-sm text-gray-600 mb-6">{todayId}</p>

      {alreadySubmitted && !canEdit && (
        <div className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-green-800">
          Já submeteste o feedback de hoje.
        </div>
      )}

      {alreadySubmitted && canEdit && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-amber-800">
          Podes editar este diário.
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
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
          <label className="block font-medium mb-1">Cumpriu alimentação sem falhas?</label>
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

        {!hasConsent && (
          <label className="flex items-start gap-2 text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-md p-3">
            <input type="checkbox" checked={consentChecked} onChange={(e)=>setConsentChecked(e.currentTarget.checked)} />
            <span>Autorizo o tratamento dos meus dados de saúde para efeitos de acompanhamento e planos. Posso retirar este consentimento a qualquer momento.</span>
          </label>
        )}

        {error && <p className="text-red-600">{error}</p>}
        {savedMsg && <p className="text-green-700">{savedMsg}</p>}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={submitting || (alreadySubmitted && !canEdit)}
            className="flex-1 rounded-[20px] overflow-hidden border-[3px] border-[#706800] text-[#706800] bg-white py-2 px-4 shadow hover:bg-[#FFF4D1] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "A enviar..." : alreadySubmitted ? "Guardar alterações" : "Enviar feedback de hoje"}
          </button>


        </div>
      </form>
      </div>

    </main>
  );
}
