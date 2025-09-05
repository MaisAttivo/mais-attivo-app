"use client";

import { useCallback, useRef, useState } from "react";
import EmojiCalendar from "@/components/EmojiCalendar";

type Mode = "workout" | "diet" | "cardio";

const MODES: { key: Mode; label: string; emoji: string }[] = [
  { key: "workout", label: "Treino", emoji: "💪" },
  { key: "diet", label: "Alimentação", emoji: "🔥" },
  { key: "cardio", label: "Cardio", emoji: "🏃‍♂️" },
];

export default function SwitchableCalendar({ uid }: { uid: string }) {
  const [idx, setIdx] = useState(0);
  const [range, setRange] = useState<"2m" | "all">("2m");
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  const prev = useCallback(() => setIdx((i) => (i - 1 + MODES.length) % MODES.length), []);
  const next = useCallback(() => setIdx((i) => (i + 1) % MODES.length), []);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current == null || startY.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    startX.current = null;
    startY.current = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return; // limiar e ignora scroll vertical
    if (dx < 0) next(); else prev();
  }

  const m = MODES[idx];

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={prev} aria-label="Anterior" className="rounded border px-1.5 py-0.5 text-xs hover:bg-gray-50">←</button>
        <div className="text-sm font-medium select-none">
          <span className="mr-1" aria-hidden>{m.emoji}</span>
          <span>{m.label}</span>
        </div>
        <button type="button" onClick={next} aria-label="Seguinte" className="rounded border px-1.5 py-0.5 text-xs hover:bg-gray-50">→</button>
      </div>
      <EmojiCalendar uid={uid} mode={m.key} />
    </div>
  );
}
