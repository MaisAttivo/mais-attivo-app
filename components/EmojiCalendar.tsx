"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { lisbonYMD } from "@/lib/utils";

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
function toLisbonYMD(date: Date): string {
  return lisbonYMD(date);
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
    const fmt = new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric", timeZone: "Europe/Lisbon" });
    return fmt.format(anchor);
  }, [anchor]);

  const todayYMD = useMemo(() => toLisbonYMD(new Date()), []);

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
          const id = toLisbonYMD(dateVal);
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
  const label = mode === "workout" ? "Treinos" : "Alimentação";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-base">{label} — {title}</div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAnchor((d) => addMonths(d, -1))}
            className="rounded border px-1.5 py-0.5 text-xs hover:bg-gray-50"
            aria-label="Mês anterior"
            title="Mês anterior"
          >←</button>
          <button
            type="button"
            onClick={() => setAnchor(getMonthStart(new Date()))}
            className="rounded border px-1.5 py-0.5 text-xs hover:bg-gray-50"
            aria-label="Hoje"
            title="Hoje"
          >Hoje</button>
          <button
            type="button"
            onClick={() => setAnchor((d) => addMonths(d, 1))}
            className="rounded border px-1.5 py-0.5 text-xs hover:bg-gray-50"
            aria-label="Próximo mês"
            title="Próximo mês"
          >→</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-slate-600">
        <div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div><div>Dom</div>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((date, idx) => {
          if (!date) return <div key={idx} className="h-6 sm:h-7" />;
          const ymd = toLisbonYMD(date);
          const info = days[ymd];
          const isToday = ymd === todayYMD;
          const hasEmoji = Boolean(info?.has);
          const clickable = isToday; // Apenas o dia de hoje abre o formulário
          const content = hasEmoji ? emoji : String(date.getDate());
          return (
            <div key={ymd} className="h-6 sm:h-7 flex items-center justify-center rounded border text-[11px] select-none">
              {clickable ? (
                <a href="/daily" className={`block w-full h-full flex items-center justify-center ${isToday ? "bg-amber-50" : ""}`} title={isToday ? "Abrir diário de hoje" : undefined}>
                  <span className="leading-none">{content}</span>
                </a>
              ) : (
                <span className="leading-none">{content}</span>
              )}
            </div>
          );
        })}
      </div>

      {loading && <div className="text-[10px] text-slate-500">A carregar…</div>}
    </div>
  );
}
