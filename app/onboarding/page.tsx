"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function OnboardingPage() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState<number | "">("");

  async function save() {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      alert("Não estás autenticado.");
      return;
    }

    await addDoc(collection(db, `users/${uid}/questionnaire`), {
      goal,
      workoutsPerWeek: Number(workoutsPerWeek || 0),
      questionnaireVersion: "v1",
      completedAt: serverTimestamp(),
    });

    router.push("/client/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-xl border p-6">
        <h1 className="text-2xl font-semibold mb-4">Questionário inicial</h1>
        <div className="grid gap-3">
          <label className="text-sm">Objetivo principal</label>
          <input
            className="border rounded px-3 py-2"
            placeholder="Perder gordura, ganhar massa, etc."
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <label className="text-sm mt-2">Treinos por semana</label>
          <input
            className="border rounded px-3 py-2"
            type="number"
            min={0}
            value={workoutsPerWeek}
            onChange={(e) => setWorkoutsPerWeek((e.target as HTMLInputElement).value as any)}
          />
          <button onClick={save} className="mt-2 rounded px-3 py-2 border hover:bg-gray-50">
            Guardar e continuar
          </button>
        </div>
      </div>
    </main>
  );
}
