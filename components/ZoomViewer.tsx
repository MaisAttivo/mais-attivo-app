"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";

function usePanZoom() {
  const state = useRef({ scale: 1, x: 0, y: 0, lastX: 0, lastY: 0, dragging: false }).current;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const apply = () => { if (containerRef.current) containerRef.current.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`; };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    state.dragging = true; state.lastX = e.clientX; state.lastY = e.clientY;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX; const dy = e.clientY - state.lastY;
    state.x += dx; state.y += dy; state.lastX = e.clientX; state.lastY = e.clientY; apply();
  };
  const onPointerUp = () => { state.dragging = false; };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    state.scale = Math.min(8, Math.max(0.2, state.scale * factor));
    apply();
  };
  const reset = () => { state.scale = 1; state.x = 0; state.y = 0; apply(); };
  const zoomIn = () => { state.scale = Math.min(8, state.scale * 1.2); apply(); };
  const zoomOut = () => { state.scale = Math.max(0.2, state.scale / 1.2); apply(); };

  return { containerRef, onPointerDown, onPointerMove, onPointerUp, onWheel, reset, zoomIn, zoomOut };
}

export default function ZoomViewer({ url, kind, onClose }: { url: string; kind: "image" | "pdf"; onClose: () => void }) {
  const { containerRef, onPointerDown, onPointerMove, onPointerUp, onWheel, reset, zoomIn, zoomOut } = usePanZoom();
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col p-4">
      <div className="flex justify-end gap-2 mb-2">
        <Button size="sm" variant="outline" onClick={zoomOut}>−</Button>
        <Button size="sm" variant="outline" onClick={zoomIn}>+</Button>
        <Button size="sm" variant="secondary" onClick={reset}>Repor</Button>
        <Button size="sm" variant="secondary" onClick={onClose}>Fechar</Button>
      </div>
      <div className="relative w-full h-[72vh] sm:h-[84vh] bg-black/5 rounded-lg overflow-hidden">
        <div className="w-full h-full overflow-auto cursor-grab active:cursor-grabbing" onWheel={onWheel}>
          <div ref={containerRef as any} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="origin-center touch-none select-none">
            {kind === "image" ? (
              <img src={url} alt="preview" className="max-w-none" />
            ) : (
              <object data={url} type="application/pdf" className="w-[100vw] max-w-none h-[80vh]">
                <iframe className="w-[100vw] h-[80vh]" src={"https://drive.google.com/viewerng/viewer?embedded=true&url="+encodeURIComponent(url)} title="Pré-visualização PDF"></iframe>
              </object>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
