"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import SimpleLineChart, { Series } from "@/components/SimpleLineChart";

export type EvolutionData = {
  pesoSemanal: { x: number; y: number }[];
  pesoCheckin: { x: number; y: number }[];
  massaMuscular: { x: number; y: number }[];
  massaGorda: { x: number; y: number }[];
  gorduraVisceral: { x: number; y: number }[];
};

type Mode = "peso" | "musculo" | "gordura" | "visceral";

const MODES: { key: Mode; label: string; emoji: string }[] = [
  { key: "peso", label: "Peso", emoji: "⚖️" },
  { key: "musculo", label: "Massa Muscular", emoji: "💪" },
  { key: "gordura", label: "Massa Gorda", emoji: "🔥" },
  { key: "visceral", label: "Gordura Visceral", emoji: "🧬" },
];

export default function SwitchableEvolution({ data }: { data: EvolutionData }) {
  const [idx, setIdx] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  const prev = useCallback(() => setIdx((i) => (i - 1 + MODES.length) % MODES.length), []);
  const next = useCallback(() => setIdx((i) => (i + 1) % MODES.length), []);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    startX.current = t.clientX; startY.current = t.clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current == null || startY.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX.current; const dy = t.clientY - startY.current;
    startX.current = null; startY.current = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next(); else prev();
  }

  const mode = MODES[idx];

  const series: Series[] = useMemo(() => {
    if (mode.key === "peso") {
      return [
        { name: "Peso semanal (kg)", color: "#2563eb", points: data.pesoSemanal },
        { name: "Peso check-in (kg)", color: "#16a34a", points: data.pesoCheckin },
      ];
    }
    if (mode.key === "musculo") return [{ name: "Massa Muscular (kg)", color: "#7c3aed", points: data.massaMuscular }];
    if (mode.key === "gordura") return [{ name: "Massa Gorda (kg)", color: "#dc2626", points: data.massaGorda }];
    return [{ name: "Gordura Visceral", color: "#0ea5e9", points: data.gorduraVisceral }];
  }, [mode.key, data]);

  const yUnit = mode.key === "visceral" ? undefined : "kg";
  const yLabel = mode.key === "visceral" ? "Índice" : "Kg";

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={prev} aria-label="Anterior" className="rounded border px-1.5 py-0.5 text-xs hover:bg-gray-50">←</button>
        <div className="text-sm font-medium select-none">
          <span className="mr-1" aria-hidden>{mode.emoji}</span>
          <span>{mode.label}</span>
        </div>
        <button type="button" onClick={next} aria-label="Seguinte" className="rounded border px-1.5 py-0.5 text-xs hover:bg-gray-50">→</button>
      </div>
      <SimpleLineChart series={series} xLabel="Data" yLabel={yLabel} yUnit={yUnit} />
    </div>
  );
}
