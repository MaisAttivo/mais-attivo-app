"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type YesNoPT = "Sim" | "Não";

export default function OnboardingPage() {
  const router = useRouter();

  // Autenticação
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return router.push("/login");
      setUid(user.uid);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  // --- DADOS PESSOAIS ---
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [heightCm, setHeightCm] = useState<number | "">("");
  const [weightKg, setWeightKg] = useState<number | "">("");
  const [occupation, setOccupation] = useState("");

  // --- 2–20 ---
  const [goal, setGoal] = useState("");                       // 2
  const [doesOtherActivity, setDoesOtherActivity] = useState<YesNoPT>("Não"); // 3
  const [otherActivityDetails, setOtherActivityDetails] = useState("");       // 3
  const [workoutFrequency, setWorkoutFrequency] = useState<number | "">("");  // 4
  const [hasInjury, setHasInjury] = useState<YesNoPT>("Não");                 // 5
  const [injuryDetails, setInjuryDetails] = useState("");                     // 5
  const [mobilityIssues, setMobilityIssues] = useState<YesNoPT>("Não");       // 6
  const [mobilityDetails, setMobilityDetails] = useState("");                 // 6
  const [hasPain, setHasPain] = useState<YesNoPT>("Não");                     // 7
  const [painLocation, setPainLocation] = useState("");                       // 7
  const [dietDifficulty, setDietDifficulty] = useState("");                   // 8
  const [takesMedication, setTakesMedication] = useState<YesNoPT>("Não");     // 9
  const [medication, setMedication] = useState("");                           // 9
  const [intestinalIssues, setIntestinalIssues] = useState<YesNoPT>("Não");   // 10
  const [intestinalDetails, setIntestinalDetails] = useState("");             // 10
  const [hasDiagnosedDisease, setHasDiagnosedDisease] = useState<YesNoPT>("Não"); // 11
  const [diagnosedDisease, setDiagnosedDisease] = useState("");               // 11
  const [hasFoodAllergy, setHasFoodAllergy] = useState<YesNoPT>("Não");       // 12
  const [foodAllergy, setFoodAllergy] = useState("");                         // 12
  const [foodsDisliked, setFoodsDisliked] = useState("");                     // 13
  const [foodsLiked, setFoodsLiked] = useState("");                           // 14
  const [takesSupplements, setTakesSupplements] = useState<YesNoPT>("Não");   // 15
  const [supplements, setSupplements] = useState("");                         // 15
  const [waterLitersPerDay, setWaterLitersPerDay] = useState<number | "">(""); // 16
  const [sleepQuality, setSleepQuality] = useState("");                       // 17
  const [sleepHours, setSleepHours] = useState<number | "">("");              // 18
  const [drinksAlcohol, setDrinksAlcohol] = useState<YesNoPT>("Não");          // 19
  const [alcoholFrequency, setAlcoholFrequency] = useState("");               // 19
  const [mealRoutine, setMealRoutine] = useState("");                         // 20
  const [otherNotes, setOtherNotes] = useState("");                            // 21 - Outras Observações Relevantes

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justErrored, setJustErrored] = useState(false);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const submitRef = useRef<HTMLButtonElement | null>(null);

  const toNum = (v: number | "" | undefined) => (isNaN(Number(v)) ? 0 : Number(v));
  const yesNoToBool = (v: YesNoPT) => v === "Sim";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;

    const notifyError = (msg: string) => {
      setError(msg);
      setJustErrored(true);
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        try { (navigator as any).vibrate?.(30); } catch {}
      }
      setTimeout(() => setJustErrored(false), 500);
      setTimeout(() => {
        errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 10);
    };

    // validações essenciais
    if (!fullName.trim()) return notifyError("Preenche o nome.");
    if (!age || !heightCm || !weightKg) return notifyError("Preenche idade, altura e peso.");
    if (!goal.trim()) return notifyError("Indica o objetivo.");
    if (doesOtherActivity === "Sim" && !otherActivityDetails.trim()) return notifyError("Indica a atividade fora do ginásio.");
    if (hasInjury === "Sim" && !injuryDetails.trim()) return notifyError("Indica onde/qual foi a lesão.");
    if (mobilityIssues === "Sim" && !mobilityDetails.trim()) return notifyError("Indica o problema de mobilidade.");
    if (hasPain === "Sim" && !painLocation.trim()) return notifyError("Indica onde dói.");
    if (takesMedication === "Sim" && !medication.trim()) return notifyError("Indica a medicação.");
    if (intestinalIssues === "Sim" && !intestinalDetails.trim()) return notifyError("Indica o problema intestinal.");
    if (hasDiagnosedDisease === "Sim" && !diagnosedDisease.trim()) return notifyError("Indica a doença diagnosticada.");
    if (hasFoodAllergy === "Sim" && !foodAllergy.trim()) return notifyError("Indica a alergia/intolerância.");
    if (!mealRoutine.trim()) return notifyError("Descreve a tua rotina de refeições.");

    setSaving(true);
    setError(null);

    try {
      const wf = Math.max(0, parseInt(String(workoutFrequency as any), 10) || 0);
      const weightN = toNum(weightKg);
      const metaAguaCalc = weightN > 0 ? Number((weightN * 0.05).toFixed(2)) : 4;
      try {
        await updateDoc(doc(db, "users", uid), {
          healthDataExplicitConsent: true,
          updatedAt: serverTimestamp(),
        });
      } catch {}

      await addDoc(collection(db, `users/${uid}/questionnaire`), {
        // pessoais
        fullName: fullName.trim(),
        age: toNum(age),
        heightCm: toNum(heightCm),
        weightKg: toNum(weightKg),
        occupation: occupation.trim(),

        // 2–20 na MESMA ORDEM do formulário
        goal: goal.trim(),

        doesOtherActivity: yesNoToBool(doesOtherActivity),
        otherActivityDetails: otherActivityDetails.trim(),

        workoutFrequency: wf,

        hasInjury: yesNoToBool(hasInjury),
        injuryDetails: injuryDetails.trim(),

        mobilityIssues: yesNoToBool(mobilityIssues),
        mobilityDetails: mobilityDetails.trim(),

        hasPain: yesNoToBool(hasPain),
        painLocation: painLocation.trim(),

        dietDifficulty: dietDifficulty.trim(),

        takesMedication: yesNoToBool(takesMedication),
        medication: medication.trim(),

        intestinalIssues: yesNoToBool(intestinalIssues),
        intestinalDetails: intestinalDetails.trim(),

        hasDiagnosedDisease: yesNoToBool(hasDiagnosedDisease),
        diagnosedDisease: diagnosedDisease.trim(),

        hasFoodAllergy: yesNoToBool(hasFoodAllergy),
        foodAllergy: foodAllergy.trim(),

        foodsDisliked: foodsDisliked.trim(),
        foodsLiked: foodsLiked.trim(),

        takesSupplements: yesNoToBool(takesSupplements),
        supplements: supplements.trim(),

        waterLitersPerDay: toNum(waterLitersPerDay),
        sleepQuality: sleepQuality.trim(),
        sleepHours: toNum(sleepHours),

        drinksAlcohol: yesNoToBool(drinksAlcohol),
        alcoholFrequency: alcoholFrequency.trim(),

        mealRoutine: mealRoutine.trim(),
        otherNotes: otherNotes.trim(),

        questionnaireVersion: "v2",
        completedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", uid), {
        workoutFrequency: wf,
        metaAgua: metaAguaCalc,
        onboardingDone: true,
        updatedAt: serverTimestamp(),
      });

      router.push("/fotos?welcome=1");
    } catch (err) {
      console.error(err);
      setError("Não foi possível guardar o questionário.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-center mt-10">A carregar…</p>;

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Questionário Inicial</h1>

      <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
      <form onSubmit={handleSave} className="space-y-8">
        {/* 1. Dados Pessoais */}
        <section>
          <h2 className="text-lg font-semibold mb-3">1. Dados Pessoais</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Nome</label>
              <input className="w-full border rounded p-2" placeholder="Ex: João Silva" value={fullName} onChange={(e)=>setFullName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Idade</label>
              <input className="w-full border rounded p-2" type="number" placeholder="Ex: 28" value={age} onChange={(e)=>setAge((e.target as HTMLInputElement).value as any)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Altura (cm)</label>
              <input className="w-full border rounded p-2" type="number" placeholder="Ex: 178" value={heightCm} onChange={(e)=>setHeightCm((e.target as HTMLInputElement).value as any)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Peso (kg)</label>
              <input className="w-full border rounded p-2" type="number" placeholder="Ex: 74.5" value={weightKg} onChange={(e)=>setWeightKg((e.target as HTMLInputElement).value as any)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium">Profissão</label>
              <input className="w-full border rounded p-2" placeholder="Ex: Técnico de informática" value={occupation} onChange={(e)=>setOccupation(e.target.value)} />
            </div>
          </div>
        </section>

        {/* 2. Objetivo */}
        <section>
          <label className="block text-sm font-medium mb-1">2. Qual o objetivo?</label>
          <input className="w-full border rounded p-2" placeholder="Ex: Perder gordura" value={goal} onChange={(e)=>setGoal(e.target.value)} />
        </section>

        {/* 3. Atividade fora do ginásio */}
        <section>
          <label className="block text-sm font-medium">3. Pratica alguma atividade física fora do ginásio?</label>
          <div className="flex gap-6 mt-1">
            <label><input type="radio" name="doesOtherActivity" value="Sim" checked={doesOtherActivity==="Sim"} onChange={(e)=>setDoesOtherActivity(e.target.value as YesNoPT)} /> Sim</label>
            <label><input type="radio" name="doesOtherActivity" value="Não" checked={doesOtherActivity==="Não"} onChange={(e)=>setDoesOtherActivity(e.target.value as YesNoPT)} /> Não</label>
          </div>
          {doesOtherActivity === "Sim" && (
            <div className="mt-3">
              <label className="block text-sm font-medium">Se sim, onde/qual?</label>
              <input className="w-full border rounded p-2" placeholder="Ex: Futebol 1x/semana" value={otherActivityDetails} onChange={(e)=>setOtherActivityDetails(e.target.value)} />
            </div>
          )}
        </section>

        {/* 4. Treinos por semana */}
        <section>
          <label className="block text-sm font-medium mb-1">4. Quantas vezes treina por semana?</label>
          <input className="w-full border rounded p-2" type="number" min={0} placeholder="Ex: 4" value={workoutFrequency} onChange={(e)=>setWorkoutFrequency((e.target as HTMLInputElement).value as any)} />
        </section>

        {/* 5. Lesão */}
        <section>
          <label className="block text-sm font-medium">5. Teve alguma Lesão?</label>
          <div className="flex gap-6 mt-1">
            <label><input type="radio" name="hasInjury" value="Sim" checked={hasInjury==="Sim"} onChange={(e)=>setHasInjury(e.target.value as YesNoPT)} /> Sim</label>
            <label><input type="radio" name="hasInjury" value="Não" checked={hasInjury==="Não"} onChange={(e)=>setHasInjury(e.target.value as YesNoPT)} /> Não</label>
          </div>
          {hasInjury === "Sim" && (
            <div className="mt-3">
              <label className="block text-sm font-medium">Se sim, onde?</label>
              <input className="w-full border rounded p-2" placeholder="Ex: Tornozelo direito (2023)" value={injuryDetails} onChange={(e)=>setInjuryDetails(e.target.value)} />
            </div>
          )}
        </section>

        {/* 6. Mobilidade */}
        <section>
          <label className="block text-sm font-medium">6. Tem algum problema de mobilidade?</label>
          <div className="flex gap-6 mt-1">
            <label><input type="radio" name="mobilityIssues" value="Sim" checked={mobilityIssues==="Sim"} onChange={(e)=>setMobilityIssues(e.target.value as YesNoPT)} /> Sim</label>
            <label><input type="radio" name="mobilityIssues" value="Não" checked={mobilityIssues==="Não"} onChange={(e)=>setMobilityIssues(e.target.value as YesNoPT)} /> Não</label>
          </div>
          {mobilityIssues === "Sim" && (
            <div className="mt-3">
              <label className="block text-sm font-medium">Se sim, onde?</label>
              <input className="w-full border rounded p-2" placeholder="Ex: Mobilidade do ombro esquerdo" value={mobilityDetails} onChange={(e)=>setMobilityDetails(e.target.value)} />
            </div>
          )}
        </section>

        {/* 7. Dor articular/muscular */}
        <section>
          <label className="block text-sm font-medium">7. Sente alguma dor articular ou muscular?</label>
          <div className="flex gap-6 mt-1">
            <label><input type="radio" name="hasPain" value="Sim" checked={hasPain==="Sim"} onChange={(e)=>setHasPain(e.target.value as YesNoPT)} /> Sim</label>
            <label><input type="radio" name="hasPain" value="Não" checked={hasPain==="Não"} onChange={(e)=>setHasPain(e.target.value as YesNoPT)} /> Não</label>
          </div>
          {hasPain === "Sim" && (
            <div className="mt-3">
              <label className="block text-sm font-medium">Se sim, onde?</label>
              <input className="w-full border rounded p-2" placeholder="Ex: Lombar ao final do dia" value={painLocation} onChange={(e)=>setPainLocation(e.target.value)} />
            </div>
          )}
        </section>

        {/* 8. Dificuldade na dieta */}
        <section>
          <label className="block text-sm font-medium mb-1">8. Qual a principal dificuldade na dieta?</label>
          <input className="w-full border rounded p-2" placeholder="Ex: Comer ao fim de semana" value={dietDifficulty} onChange={(e)=>setDietDifficulty(e.target.value)} />
        </section>

        {/* 9. Medicação */}
        <section>
          <label className="block text-sm font-medium">9. Toma alguma medicação?</label>
          <div className="flex gap-6 mt-1">
            <label><input type="radio" name="takesMedication" value="Sim" checked={takesMedication==="Sim"} onChange={(e)=>setTakesMedication(e.target.value as YesNoPT)} /> Sim</label>
            <label><input type="radio" name="takesMedication" value="Não" checked={takesMedication==="Não"} onChange={(e)=>setTakesMedication(e.target.value as YesNoPT)} /> Não</label>
          </div>
          {takesMedication === "Sim" && (
            <div className="mt-3">
              <label className="block text-sm font-medium">Se sim, qual?</label>
              <input className="w-full border rounded p-2" placeholder="Ex: Anti-inflamatório 1x/dia" value={medication} onChange={(e)=>setMedication(e.target.value)} />
            </div>
          )}
        </section>

        {/* 10. Problema intestinal */}
        <section>
          <label className="block text-sm font-medium">10. Tem algum problema intestinal?</label>
          <div className="flex gap-6 mt-1">
            <label><input type="radio" name="intestinalIssues" value="Sim" checked={intestinalIssues==="Sim"} onChange={(e)=>setIntestinalIssues(e.target.value as YesNoPT)} /> Sim</label>
            <label><input type="radio" name="intestinalIssues" value="Não" checked={intestinalIssues==="Não"} onChange={(e)=>setIntestinalIssues(e.target.value as YesNoPT)} /> Não</label>
          </div>
          {intestinalIssues === "Sim" && (
            <div className="mt-3">
              <label className="block text-sm font-medium">Se sim, qual?</label>
              <input className="w-full border rounded p-2" placeholder="Ex: Colite / Intestino irritável" value={intestinalDetails} onChange={(e)=>setIntestinalDetails(e.target.value)} />
            </div>
          )}
        </section>

        {/* 11. Doença diagnosticada */}
        <section>
          <label className="block text-sm font-medium">11. Possui alguma doença diagnosticada?</label>
          <div className="flex gap-6 mt-1">
            <label><input type="radio" name="hasDiagnosedDisease" value="Sim" checked={hasDiagnosedDisease==="Sim"} onChange={(e)=>setHasDiagnosedDisease(e.target.value as YesNoPT)} /> Sim</label>
            <label><input type="radio" name="hasDiagnosedDisease" value="Não" checked={hasDiagnosedDisease==="Não"} onChange={(e)=>setHasDiagnosedDisease(e.target.value as YesNoPT)} /> Não</label>
          </div>
          {hasDiagnosedDisease === "Sim" && (
            <div className="mt-3">
              <label className="block text-sm font-medium">Se sim, qual?</label>
              <input className="w-full border rounded p-2" placeholder="Ex: Hipotiroidismo" value={diagnosedDisease} onChange={(e)=>setDiagnosedDisease(e.target.value)} />
            </div>
          )}
        </section>

        {/* 12. Alergia/intolerância */}
        <section>
          <label className="block text-sm font-medium">12. Tem alguma alergia ou intolerância a alimentos?</label>
          <div className="flex gap-6 mt-1">
            <label><input type="radio" name="hasFoodAllergy" value="Sim" checked={hasFoodAllergy==="Sim"} onChange={(e)=>setHasFoodAllergy(e.target.value as YesNoPT)} /> Sim</label>
            <label><input type="radio" name="hasFoodAllergy" value="Não" checked={hasFoodAllergy==="Não"} onChange={(e)=>setHasFoodAllergy(e.target.value as YesNoPT)} /> Não</label>
          </div>
          {hasFoodAllergy === "Sim" && (
            <div className="mt-3">
              <label className="block text-sm font-medium">Se sim, qual?</label>
              <input className="w-full border rounded p-2" placeholder="Ex: Lactose / Glúten / Marisco" value={foodAllergy} onChange={(e)=>setFoodAllergy(e.target.value)} />
            </div>
          )}
        </section>

        {/* 13–14. Alimentos */}
        <section>
          <label className="block text-sm font-medium mb-1">13. Que alimentos não gosta?</label>
          <input className="w-full border rounded p-2 mb-4" placeholder="Ex: Fígado, brócolos" value={foodsDisliked} onChange={(e)=>setFoodsDisliked(e.target.value)} />
          <label className="block text-sm font-medium mb-1">14. Que alimentos mais gosta?</label>
          <input className="w-full border rounded p-2" placeholder="Ex: Salmão, arroz, iogurte" value={foodsLiked} onChange={(e)=>setFoodsLiked(e.target.value)} />
        </section>

        {/* 15. Suplementos */}
        <section>
          <label className="block text-sm font-medium">15. Toma suplementação alimentar?</label>
          <div className="flex gap-6 mt-1">
            <label><input type="radio" name="takesSupplements" value="Sim" checked={takesSupplements==="Sim"} onChange={(e)=>setTakesSupplements(e.target.value as YesNoPT)} /> Sim</label>
            <label><input type="radio" name="takesSupplements" value="Não" checked={takesSupplements==="Não"} onChange={(e)=>setTakesSupplements(e.target.value as YesNoPT)} /> Não</label>
          </div>
          {takesSupplements === "Sim" && (
            <div className="mt-3">
              <label className="block text-sm font-medium">Se sim, qual?</label>
              <input className="w-full border rounded p-2" placeholder="Ex: Whey, Creatina, Omega-3" value={supplements} onChange={(e)=>setSupplements(e.target.value)} />
            </div>
          )}
        </section>

        {/* 16–18. Água e Sono */}
        <section className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">16. Quanta água bebes por dia?</label>
            <input className="w-full border rounded p-2" type="number" step="0.1" min={0} placeholder="Ex: 2.5" value={waterLitersPerDay} onChange={(e)=>setWaterLitersPerDay((e.target as HTMLInputElement).value as any)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">17. Como está a qualidade do sono?</label>
            <input className="w-full border rounded p-2" placeholder="Ex: Boa / Razoável / Fraca" value={sleepQuality} onChange={(e)=>setSleepQuality(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">18. Quantas horas de sono dormes por noite (média)?</label>
            <input className="w-full border rounded p-2" type="number" min={0} max={24} placeholder="Ex: 7" value={sleepHours} onChange={(e)=>setSleepHours((e.target as HTMLInputElement).value as any)} />
          </div>
        </section>

        {/* 19. Álcool */}
        <section>
          <label className="block text-sm font-medium">19. Ingeres bebidas alcoólicas com frequência?</label>
          <div className="flex gap-6 mt-1">
            <label><input type="radio" name="drinksAlcohol" value="Sim" checked={drinksAlcohol==="Sim"} onChange={(e)=>setDrinksAlcohol(e.target.value as YesNoPT)} /> Sim</label>
            <label><input type="radio" name="drinksAlcohol" value="Não" checked={drinksAlcohol==="Não"} onChange={(e)=>setDrinksAlcohol(e.target.value as YesNoPT)} /> Não</label>
          </div>
          {drinksAlcohol === "Sim" && (
            <div className="mt-3">
              <label className="block text-sm font-medium">Se sim, com que frequência?</label>
              <input className="w-full border rounded p-2" placeholder="Ex: 1–2x/semana" value={alcoholFrequency} onChange={(e)=>setAlcoholFrequency(e.target.value)} />
            </div>
          )}
        </section>

        {/* 20. Rotina de refeições */}
        <section>
          <label className="block text-sm font-medium mb-1">20. Descreve a tua rotina atual de Refeições (horários e o que comes normalmente)</label>
          <textarea className="w-full border rounded p-2 min-h-[100px]" placeholder="Ex: Pequeno-almoço 8h; Almoço 13h; Lanche 17h; Jantar 20h…" value={mealRoutine} onChange={(e)=>setMealRoutine(e.target.value)} />
        </section>

        {/* 21. Outras Observações Relevantes */}
        <section>
          <label className="block text-sm font-medium mb-1">21. Outras Observações Relevantes</label>
          <textarea className="w-full border rounded p-2 min-h-[100px]" placeholder="Algo que devas acrescentar (horários, preferências, histórico, etc.)" value={otherNotes} onChange={(e)=>setOtherNotes(e.target.value)} />
        </section>

        {error && (
          <p ref={errorRef} role="alert" aria-live="assertive" className="text-red-600">
            {error}
          </p>
        )}

        <button
          ref={submitRef}
          type="submit"
          disabled={saving}
          aria-busy={saving}
          className={`w-full rounded-[20px] overflow-hidden border-[3px] border-[#706800] text-[#706800] bg-white py-2 px-4 shadow hover:bg-[#FFF4D1] active:scale-95 transition-transform ${justErrored ? "animate-pulse" : ""}`}
        >
          {saving ? "A guardar..." : "Enviar questionário"}
        </button>
      </form>
      </div>
    </main>
  );
}
