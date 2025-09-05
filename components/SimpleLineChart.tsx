"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type Series = { name: string; color: string; points: { x: number; y: number }[] };

export default function SimpleLineChart({ series, height = 180 }: { series: Series[]; height?: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(360);
  const [tip, setTip] = useState<{ x: number; y: number; label: string } | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || 360;
      setWidth(Math.max(160, Math.round(w)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const flat = series.flatMap((s) => s.points);
  const hasData = flat.length > 0;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    if (!hasData) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const xs = flat.map((p) => p.x);
    const ys = flat.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const yPad = (maxY - minY) * 0.1 || 1;
    const xPad = (maxX - minX) * 0.02 || 1;
    return { xMin: minX - xPad, xMax: maxX + xPad, yMin: yPad ? minY - yPad : minY - 1, yMax: yPad ? maxY + yPad : maxY + 1 };
  }, [flat, hasData]);

  function xScale(x: number) {
    if (xMax === xMin) return 0;
    return ((x - xMin) / (xMax - xMin)) * (width - 24) + 12; // 12px padding
  }
  function yScale(y: number) {
    if (yMax === yMin) return height / 2;
    return height - (((y - yMin) / (yMax - yMin)) * (height - 24) + 12);
  }

  function pathFor(points: { x: number; y: number }[]) {
    if (points.length === 0) return "";
    const sorted = [...points].sort((a, b) => a.x - b.x);
    return sorted.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.x)},${yScale(p.y)}`).join(" ");
  }

  function handleShowTip(sName: string, color: string, p: { x: number; y: number }) {
    const dt = new Date(p.x);
    const dateText = isFinite(dt.getTime()) ? new Intl.DateTimeFormat("pt-PT", { year: "numeric", month: "2-digit", day: "2-digit" }).format(dt) : String(p.x);
    const valText = typeof p.y === "number" ? p.y.toString() : String(p.y);
    const label = `${sName ? sName + " — " : ""}${dateText}: ${valText}`;
    const cx = xScale(p.x);
    const cy = yScale(p.y);
    setTip({ x: cx, y: cy, label });
  }

  return (
    <div ref={wrapRef} className="w-full relative">
      {!hasData ? (
        <div className="text-sm text-slate-500">Sem dados.</div>
      ) : (
        <svg width={width} height={height} role="img" aria-label="gráfico de evolução">
          {series.map((s, idx) => (
            <g key={idx}>
              <path d={pathFor(s.points)} fill="none" stroke={s.color} strokeWidth={2} />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={xScale(p.x)}
                  cy={yScale(p.y)}
                  r={4}
                  fill={s.color}
                  className="cursor-pointer"
                  onMouseEnter={() => handleShowTip(s.name, s.color, p)}
                  onMouseMove={() => handleShowTip(s.name, s.color, p)}
                  onMouseLeave={() => setTip(null)}
                  onClick={() => handleShowTip(s.name, s.color, p)}
                  onTouchStart={() => handleShowTip(s.name, s.color, p)}
                />
              ))}
            </g>
          ))}
        </svg>
      )}
      {tip && (
        <div
          className="absolute -translate-x-1/2 -translate-y-full bg-white text-slate-800 text-xs px-2 py-1 rounded-xl shadow-lg ring-2 ring-slate-400 pointer-events-none"
          style={{ left: tip.x, top: tip.y - 6 }}
          role="status"
          aria-live="polite"
        >
          {tip.label}
        </div>
      )}
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-700">
          {series.map((s, i) => (
            <div key={i} className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: s.color }} />
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
