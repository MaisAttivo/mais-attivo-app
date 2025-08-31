"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";

type Props = {
  uid: string;
  mode: "workout" | "diet";
};

type DayInfo = {
  id: string; // YYYY-MM-DD in local time (derived from JS Date at midnight local)
  has: boolean;
};

function getMonthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function getMonthEnd(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function toLocalYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addMonths(d: Date, months: number) {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + months);
  return nd;
}

function getMonthMatrix(monthAnchor: Date) {
  // Build a matrix of days for display, starting Monday.
  const start = getMonthStart(monthAnchor);
  const end = getMonthEnd(monthAnchor);

  const daysInMonth = end.getDate();

  // Day of week where Monday=1 ... Sunday=7
  const firstDow = ((start.getDay() || 7));
  const leadingBlanks = firstDow === 1 ? 0 : firstDow - 1;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function EmojiCalendar({ uid, mode }: Props) {
  const [anchor, setAnchor] = useState<Date>(() => getMonthStart(new Date()));
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<Record<string, DayInfo>>({});

  const title = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
    return fmt.format(anchor);
  }, [anchor]);

  const todayYMD = useMemo(() => toLocalYMD(new Date()), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const monthStart = getMonthStart(anchor);
        const monthEnd = getMonthEnd(anchor);
        const q = query(
          collection(db, `users/${uid}/dailyFeedback`),
          where("date", ">=", monthStart),
          where("date", "<=", monthEnd),
          orderBy("date", "asc")
        );
        const snap = await getDocs(q);
        const res: Record<string, DayInfo> = {};
        snap.forEach((doc) => {
          const data: any = doc.data();
          const dateVal = data.date?.toDate?.() as Date | undefined;
          if (!dateVal) return;
          const id = toLocalYMD(dateVal);
          const has = mode === "workout" ? Boolean(data.treinou ?? data.didWorkout) : Boolean(data.alimentacao100);
          res[id] = { id, has };
        });
        if (alive) setDays(res);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [uid, anchor, mode]);

  const cells = useMemo(() => getMonthMatrix(anchor), [anchor]);

  const emoji = mode === "workout" ? "💪" : "🔥";
  const label = mode === "workout" ? "Treinos" : "Alimentação 100%";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-lg">{label} — {title}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor((d) => addMonths(d, -1))}
            className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
            aria-label="Mês anterior"
            title="Mês anterior"
          >←</button>
          <button
            type="button"
            onClick={() => setAnchor(getMonthStart(new Date()))}
            className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
            aria-label="Hoje"
            title="Hoje"
          >Hoje</button>
          <button
            type="button"
            onClick={() => setAnchor((d) => addMonths(d, 1))}
            className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
            aria-label="Próximo mês"
            title="Próximo mês"
          >→</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-600">
        <div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div><div>Dom</div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, idx) => {
          if (!date) return <div key={idx} className="h-8 sm:h-9" />;
          const ymd = toLocalYMD(date);
          const info = days[ymd];
          const isToday = ymd === todayYMD;
          const show = Boolean(info?.has);
          const clickable = isToday; // Apenas o dia de hoje abre o formulário
          return (
            <div key={ymd} className="h-8 sm:h-9 flex items-center justify-center rounded border text-sm select-none">
              {clickable ? (
                <a href="/daily" className={`block w-full h-full flex items-center justify-center ${isToday ? "bg-amber-50" : ""}`} title={isToday ? "Abrir diário de hoje" : undefined}>
                  <span className="leading-none">{show ? emoji : ""}</span>
                </a>
              ) : (
                <span className="leading-none">{show ? emoji : ""}</span>
              )}
            </div>
          );
        })}
      </div>

      {loading && <div className="text-xs text-slate-500">A carregar…</div>}
    </div>
  );
}
