"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

// ===== Helpers de datas (UTC) =====
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

function isWeekendUTC(date = new Date()) {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

type WeeklyData = {
  weekEndDate: any;
  howWasTheWeek: string;
  energyLevels: string;
  sleepQuality: string;
  stressLevels: string;
  dietChallenges: string;
  workoutChallenges: string;
};

export default function WeeklyPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [form, setForm] = useState<WeeklyData>({
    weekEndDate: new Date(),
    howWasTheWeek: "",
    energyLevels: "",
    sleepQuality: "",
    stressLevels: "",
    dietChallenges: "",
    workoutChallenges: "",
  });
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const canFillThisWeekend = useMemo(() => isWeekendUTC(new Date()), []);
  const thisWeekId = useMemo(() => yearWeekIdUTC(new Date()), []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u ? u.uid : null);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    (async () => {
      if (!uid) return;
      setLoadingDoc(true);
      try {
        const ref = doc(db, `users/${uid}/weeklyFeedback/${thisWeekId}`);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d: any = snap.data();
          setForm({
            weekEndDate: d.weekEndDate?.toDate?.() || new Date(),
            howWasTheWeek: d.howWasTheWeek || "",
            energyLevels: d.energyLevels || "",
            sleepQuality: d.sleepQuality || "",
            stressLevels: d.stressLevels || "",
            dietChallenges: d.dietChallenges || "",
            workoutChallenges: d.workoutChallenges || "",
          });
        } else {
          setForm((f) => ({ ...f, weekEndDate: new Date() }));
        }
      } catch (e) {
        console.error(e);
        setToast({ type: "error", msg: "Erro ao carregar o weekly." });
      } finally {
        setLoadingDoc(false);
      }
    })();
  }, [uid, thisWeekId]);

  async function handleSubmit() {
    if (!uid) return;
    if (!canFillThisWeekend) {
      setToast({ type: "error", msg: "O weekly só pode ser preenchido ao fim-de-semana (UTC)." });
      return;
    }
    setSaving(true);
    try {
      const ref = doc(db, `users/${uid}/weeklyFeedback/${thisWeekId}`);
      await setDoc(
        ref,
        {
          weekEndDate: form.weekEndDate instanceof Date ? form.weekEndDate : new Date(),
          howWasTheWeek: form.howWasTheWeek.trim(),
          energyLevels: form.energyLevels.trim(),
          sleepQuality: form.sleepQuality.trim(),
          stressLevels: form.stressLevels.trim(),
          dietChallenges: form.dietChallenges.trim(),
          workoutChallenges: form.workoutChallenges.trim(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      setToast({ type: "success", msg: "Weekly guardado." });
    } catch (e: any) {
      console.error(e);
      setToast({ type: "error", msg: e?.message || "Erro ao guardar." });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  if (loadingAuth) return <div className="p-4">A carregar…</div>;
  if (!uid) return <div className="p-4">Inicia sessão para preencher o weekly.</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 px-4 py-2 rounded-xl text-white shadow ${
            toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <h1 className="text-2xl font-semibold">Weekly feedback</h1>

      {!canFillThisWeekend && (
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded-xl p-3 text-sm">
          O semanal só pode ser preenchido ao fim-de-semana (UTC). Tenta no Sábado ou Domingo.
        </div>
      )}

      {loadingDoc ? (
        <div className="text-sm text-gray-500">A carregar…</div>
      ) : (
        <div className="space-y-4 border p-4 rounded-2xl">
          <div>
            <label className="block text-sm font-medium mb-1">Como correu a semana?</label>
            <textarea
              placeholder="Ex: Foi uma boa semana, consegui treinar 4 vezes e mantive a dieta."
              value={form.howWasTheWeek}
              onChange={(e) => setForm((f) => ({ ...f, howWasTheWeek: e.target.value }))}
              className="border rounded-xl px-3 py-2 w-full min-h-[80px]"
              disabled={!canFillThisWeekend}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Níveis de energia</label>
              <input
                placeholder="Ex: Energia alta durante a maior parte da semana"
                type="text"
                value={form.energyLevels}
                onChange={(e) => setForm((f) => ({ ...f, energyLevels: e.target.value }))}
                className="border rounded-xl px-3 py-2 w-full"
                disabled={!canFillThisWeekend}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Qualidade do sono</label>
              <input
                placeholder="Ex: Dormi em média 7 horas por noite"
                type="text"
                value={form.sleepQuality}
                onChange={(e) => setForm((f) => ({ ...f, sleepQuality: e.target.value }))}
                className="border rounded-xl px-3 py-2 w-full"
                disabled={!canFillThisWeekend}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Níveis de stress</label>
              <input
                placeholder="Ex: Stress moderado devido ao trabalho"
                type="text"
                value={form.stressLevels}
                onChange={(e) => setForm((f) => ({ ...f, stressLevels: e.target.value }))}
                className="border rounded-xl px-3 py-2 w-full"
                disabled={!canFillThisWeekend}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Desafios na dieta</label>
              <input
                placeholder="Ex: Dificuldade em manter as refeições à noite"
                type="text"
                value={form.dietChallenges}
                onChange={(e) => setForm((f) => ({ ...f, dietChallenges: e.target.value }))}
                className="border rounded-xl px-3 py-2 w-full"
                disabled={!canFillThisWeekend}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Desafios nos treinos</label>
              <input
                placeholder="Ex: Faltei a um treino por motivo de viagem"
                type="text"
                value={form.workoutChallenges}
                onChange={(e) => setForm((f) => ({ ...f, workoutChallenges: e.target.value }))}
                className="border rounded-xl px-3 py-2 w-full"
                disabled={!canFillThisWeekend}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!canFillThisWeekend || saving}
              className="px-4 py-2 rounded-xl border shadow disabled:opacity-50"
            >
              {saving ? "A guardar…" : "Guardar weekly"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
