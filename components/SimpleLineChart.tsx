"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type Series = { name: string; color: string; points: { x: number; y: number }[] };

export default function SimpleLineChart({ series, height = 180, xLabel, yLabel, yUnit }: { series: Series[]; height?: number; xLabel?: string; yLabel?: string; yUnit?: string }) {
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

  const M = { top: 8, right: 16, bottom: 28, left: 44 };
  const innerW = Math.max(1, width - M.left - M.right);
  const innerH = Math.max(1, height - M.top - M.bottom);

  const yTicks = useMemo(() => {
    const count = 4;
    const span = yMax - yMin;
    if (!isFinite(span) || span <= 0) return [yMin, yMax];
    const step = span / count;
    const arr: number[] = [];
    for (let i = 0; i <= count; i++) arr.push(yMin + step * i);
    return arr;
  }, [yMin, yMax]);

  const xTicks = useMemo(() => {
    const count = 3;
    const span = xMax - xMin;
    if (!isFinite(span) || span <= 0) return [xMin, xMax];
    const step = span / count;
    const arr: number[] = [];
    for (let i = 0; i <= count; i++) arr.push(xMin + step * i);
    return arr;
  }, [xMin, xMax]);

  function xScale(x: number) {
    if (xMax === xMin) return M.left;
    return M.left + ((x - xMin) / (xMax - xMin)) * innerW;
  }
  function yScale(y: number) {
    if (yMax === yMin) return M.top + innerH / 2;
    return M.top + (1 - ((y - yMin) / (yMax - yMin))) * innerH;
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
    const label = `${sName ? sName + " — " : ""}${dateText}: ${valText}${yUnit ? " " + yUnit : ""}`;
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
          {/* Eixos */}
          <line x1={M.left} y1={height - M.bottom} x2={width - M.right} y2={height - M.bottom} stroke="#e5e7eb" strokeWidth={1} />
          <line x1={M.left} y1={M.top} x2={M.left} y2={height - M.bottom} stroke="#e5e7eb" strokeWidth={1} />
          {/* Ticks Y */}
          {yTicks.map((yv, i) => (
            <g key={`y-${i}`}>
              <line x1={M.left - 2} x2={M.left} y1={yScale(yv)} y2={yScale(yv)} stroke="#cbd5e1" />
              <text x={M.left - 6} y={yScale(yv) + 3} textAnchor="end" fontSize={10} fill="#64748b">{Math.round(yv * 100) / 100}</text>
            </g>
          ))}
          {/* Ticks X */}
          {xTicks.map((xv, i) => {
            const dt = new Date(xv);
            const label = isFinite(dt.getTime()) ? new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit" }).format(dt) : String(Math.round(xv));
            return (
              <g key={`x-${i}`}>
                <line y1={height - M.bottom} y2={height - M.bottom + 2} x1={xScale(xv)} x2={xScale(xv)} stroke="#cbd5e1" />
                <text y={height - M.bottom + 12} x={xScale(xv)} textAnchor="middle" fontSize={10} fill="#64748b">{label}</text>
              </g>
            );
          })}

          {/* Axis labels */}
          {xLabel && (
            <text x={(M.left + (width - M.right)) / 2} y={height - 4} textAnchor="middle" fontSize={11} fill="#475569">{xLabel}</text>
          )}
          {yLabel && (
            <text x={12} y={(M.top + (height - M.bottom)) / 2} textAnchor="middle" fontSize={11} fill="#475569" transform={`rotate(-90 12 ${(M.top + (height - M.bottom)) / 2})`}>{yLabel}</text>
          )}

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
      {series.length >= 1 && (
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
