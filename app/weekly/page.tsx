"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged, getAuth } from "firebase/auth";
import { db } from "@/lib/firebase"; // <- ajusta este caminho ao teu projeto

type WeeklyForm = {
  howWasTheWeek: string;
  energyLevels: string;     // livre (podes mudar para number se quiseres 1-10)
  sleepQuality: string;
  stressLevels: string;
  dietChallenges: string;
  workoutChallenges: string;
  comments?: string;
  weekEndDate: Date;        // será normalizada para Domingo 00:00 UTC
};

function toSundayMidnightUTC(d: Date): Date {
  // Normaliza para Domingo 00:00:00 UTC da semana de "d"
  const utcDay = d.getUTCDay(); // 0=Dom, 1=Seg, ...
  const diffToSunday = utcDay;  // quantos dias desde Domingo
  const sunday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  sunday.setUTCDate(sunday.getUTCDate() - diffToSunday);
  return sunday; // Domingo 00:00 UTC
}

// --- ISO Week helpers (ano-semana) ---
function isoWeekYear(date: Date): number {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // quinta-feira define a semana ISO
  tmp.setUTCDate(tmp.getUTCDate() + 4 - ((tmp.getUTCDay() || 7)));
  return tmp.getUTCFullYear();
}

function isoWeekNumber(date: Date): number {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // quinta-feira define a semana ISO
  tmp.setUTCDate(tmp.getUTCDate() + 4 - ((tmp.getUTCDay() || 7)));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
}

function yearWeekId(date: Date): string {
  const y = isoWeekYear(date);
  const w = String(isoWeekNumber(date)).padStart(2, "0");
  return `${y}-W${w}`;
}

export default function WeeklyFeedbackPage() {
  const auth = useMemo(() => getAuth(), []);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existsMsg, setExistsMsg] = useState<string | null>(null);

  // por defeito: semana corrente (Domingo 00:00 UTC)
  const [form, setForm] = useState<WeeklyForm>(() => ({
    howWasTheWeek: "",
    energyLevels: "",
    sleepQuality: "",
    stressLevels: "",
    dietChallenges: "",
    workoutChallenges: "",
    comments: "",
    weekEndDate: toSundayMidnightUTC(new Date()),
  }));

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u ? u.uid : null);
      setLoading(false);
    });
    return () => unsub();
  }, [auth]);

  const docId = useMemo(() => yearWeekId(form.weekEndDate), [form.weekEndDate]);

  // Verifica se já existe feedback desta semana (para bloquear UI logo)
  useEffect(() => {
    if (!uid) return;
    let isMounted = true;
    (async () => {
      try {
        const ref = doc(db, `users/${uid}/weeklyFeedback/${docId}`);
        const snap = await getDoc(ref);
        if (!isMounted) return;
        setExistsMsg(snap.exists() ? "Já existe feedback submetido para esta semana." : null);
      } catch (e) {
        // ignora
      }
    })();
    return () => { isMounted = false; };
  }, [uid, docId]);

  const handleChange =
    (field: keyof WeeklyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
    };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value; // yyyy-mm-dd
    const d = new Date(value + "T00:00:00Z");
    setForm((f) => ({ ...f, weekEndDate: toSundayMidnightUTC(d) }));
  };

  const submit = async () => {
    if (!uid) {
      setError("Precisas de iniciar sessão.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const sundayUTC = toSundayMidnightUTC(form.weekEndDate);
      const id = yearWeekId(sundayUTC);
      const ref = doc(db, `users/${uid}/weeklyFeedback/${id}`);

      // Tenta criar sem merge; se já existir, o setDoc falha no client?
      // O Firestore permite overwrite por defeito. Para respeitar as regras,
      // confia nas regras do backend; aqui validamos previamente.
      const payload = {
        howWasTheWeek: form.howWasTheWeek.trim(),
        energyLevels: form.energyLevels.trim(),
        sleepQuality: form.sleepQuality.trim(),
        stressLevels: form.stressLevels.trim(),
        dietChallenges: form.dietChallenges.trim(),
        workoutChallenges: form.workoutChallenges.trim(),
        comments: (form.comments || "").trim(),
        weekEndDate: new Date(sundayUTC), // guardado como Timestamp automaticamente
        createdAt: serverTimestamp(),
      };

      // validação simples
      const required = [
        "howWasTheWeek","energyLevels","sleepQuality",
        "stressLevels","dietChallenges","workoutChallenges"
      ] as const;
      for (const k of required) {
        // @ts-ignore
        if (!payload[k] || (typeof payload[k] === "string" && !payload[k].length)) {
          throw new Error("Por favor preenche todos os campos obrigatórios.");
        }
      }

      // Para evitar overwrite acidental, confirmamos se existe
      const existing = await getDoc(ref);
      if (existing.exists()) {
        setExistsMsg("Já existe feedback submetido para esta semana.");
        setSubmitting(false);
        return;
      }

      await setDoc(ref, payload, { merge: false });
      setExistsMsg("Feedback semanal guardado com sucesso ✅");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Ocorreu um erro ao gravar.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-6">A carregar…</div>;
  }

  if (!uid) {
    return <div className="p-6">Inicia sessão para preencher o feedback semanal.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Feedback Semanal</h1>
        <p className="text-sm opacity-80">
          Um registo por semana. O documento será criado com o ID <code>{docId}</code>.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="col-span-1">
          <label className="block text-sm mb-1">Semana (qualquer dia dessa semana)</label>
          <input
            type="date"
            className="w-full border rounded-xl px-3 py-2"
            onChange={handleDateChange}
            // mostra a data atual do form em YYYY-MM-DD (UTC)
            value={new Date(form.weekEndDate).toISOString().slice(0,10)}
          />
          <p className="text-xs mt-1 opacity-70">
            Será normalizado para <b>Domingo 00:00 UTC</b> ({docId}).
          </p>
        </div>

        <div className="col-span-1">
          <label className="block text-sm mb-1">Como correu a semana?</label>
          <input
            type="text"
            className="w-full border rounded-xl px-3 py-2"
            placeholder="Correu bem / correu assim-assim…"
            value={form.howWasTheWeek}
            onChange={handleChange("howWasTheWeek")}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Níveis de energia</label>
          <input
            type="text"
            className="w-full border rounded-xl px-3 py-2"
            placeholder="Ex.: 8/10; Senti-me com energia…"
            value={form.energyLevels}
            onChange={handleChange("energyLevels")}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Qualidade do sono</label>
          <input
            type="text"
            className="w-full border rounded-xl px-3 py-2"
            placeholder="Dormi bem a semana toda…"
            value={form.sleepQuality}
            onChange={handleChange("sleepQuality")}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Níveis de stress</label>
          <input
            type="text"
            className="w-full border rounded-xl px-3 py-2"
            placeholder="Pouco stress / muito trabalho…"
            value={form.stressLevels}
            onChange={handleChange("stressLevels")}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Desafios na dieta</label>
          <textarea
            className="w-full border rounded-xl px-3 py-2 min-h-[88px]"
            placeholder="Não me consegui organizar a meio da semana…"
            value={form.dietChallenges}
            onChange={handleChange("dietChallenges")}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Desafios no treino</label>
          <textarea
            className="w-full border rounded-xl px-3 py-2 min-h-[88px]"
            placeholder="Senti que não estava a focar bem no treino de peito…"
            value={form.workoutChallenges}
            onChange={handleChange("workoutChallenges")}
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Comentários (opcional)</label>
          <textarea
            className="w-full border rounded-xl px-3 py-2 min-h-[88px]"
            placeholder="Algo mais que queiras partilhar?"
            value={form.comments}
            onChange={handleChange("comments")}
          />
        </div>
      </div>

      {existsMsg && (
        <div className="rounded-xl border px-3 py-2 text-sm">
          {existsMsg}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500 text-red-600 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={submitting || !!existsMsg}
          className="px-4 py-2 rounded-xl border shadow disabled:opacity-50"
        >
          {submitting ? "A gravar…" : "Guardar feedback"}
        </button>
        <button
          type="button"
          onClick={() => {
            setForm((f) => ({
              ...f,
              howWasTheWeek: "",
              energyLevels: "",
              sleepQuality: "",
              stressLevels: "",
              dietChallenges: "",
              workoutChallenges: "",
              comments: "",
            }));
            setError(null);
          }}
          className="px-4 py-2 rounded-xl border"
        >
          Limpar
        </button>
      </div>
    </div>
  );
}
