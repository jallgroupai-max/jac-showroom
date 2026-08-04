"use client";

import { useCallback, useRef, useState } from "react";

const FRAME_COUNT = 36;
const DRAG_SENSITIVITY = 6; // px de arrastre por frame, sin zoom
export const MIN_SCALE = 1;
export const MAX_SCALE = 2.5;
const ZOOM_STEP = 0.5; // botones +/- y teclado
const WHEEL_ZOOM_STEP = 0.12; // por "tick" de rueda

function wrapFrame(frame: number): number {
  const n = ((frame - 1) % FRAME_COUNT) + 1;
  return n <= 0 ? n + FRAME_COUNT : n;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Point {
  x: number;
  y: number;
}

interface UseVehicleViewerResult {
  frame: number; // 1..36
  scale: number;
  offset: Point;
  isDragging: boolean;
  isZoomed: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  rotateBy: (deltaFrames: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  pointerHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
  };
  /** Alternativa accesible al drag/gesto — flechas rotan, +/-/0 hacen zoom. */
  keyboardHandlers: {
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}

/**
 * Rotación 360° + zoom/pan sobre el visualizador, unificados en un solo hook
 * porque comparten la misma superficie de gestos por puntero (docs/TRD.md
 * §4.1-§4.5): con la vista sin zoom, arrastrar con un dedo/mouse rota el
 * vehículo (comportamiento histórico, sin cambios); en cuanto hay zoom
 * aplicado, el mismo arrastre desplaza (pan) la vista en su lugar. El pellizco
 * de dos dedos, la rueda del mouse y el doble clic hacen zoom directamente.
 */
export function useVehicleViewer(initialFrame = 1): UseVehicleViewerResult {
  const [frame, setFrame] = useState(initialFrame);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const dragStart = useRef<{ x: number; y: number; frame: number; offset: Point } | null>(null);
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);

  const clampOffset = useCallback((next: Point, s: number): Point => {
    if (s <= MIN_SCALE) return { x: 0, y: 0 };
    const el = containerRef.current;
    const maxX = el ? (el.clientWidth * (s - 1)) / 2 : 0;
    const maxY = el ? (el.clientHeight * (s - 1)) / 2 : 0;
    return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }, []);

  const applyScale = useCallback(
    (next: number) => {
      const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
      setScale(clamped);
      setOffset((prev) => (clamped <= MIN_SCALE ? { x: 0, y: 0 } : clampOffset(prev, clamped)));
    },
    [clampOffset]
  );

  const rotateBy = useCallback((deltaFrames: number) => {
    setFrame((f) => wrapFrame(f + deltaFrames));
  }, []);

  const zoomIn = useCallback(() => applyScale(scale + ZOOM_STEP), [applyScale, scale]);
  const zoomOut = useCallback(() => applyScale(scale - ZOOM_STEP), [applyScale, scale]);
  const resetZoom = useCallback(() => applyScale(MIN_SCALE), [applyScale]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
        dragStart.current = null;
        setIsDragging(false);
      } else if (pointers.current.size === 1) {
        dragStart.current = { x: e.clientX, y: e.clientY, frame, offset };
        setIsDragging(true);
      }
    },
    [frame, offset, scale]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2 && pinchStart.current) {
        const [a, b] = Array.from(pointers.current.values());
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        applyScale(pinchStart.current.scale * (distance / pinchStart.current.distance));
        return;
      }

      if (pointers.current.size === 1 && dragStart.current) {
        const deltaX = e.clientX - dragStart.current.x;
        const deltaY = e.clientY - dragStart.current.y;
        if (scale > MIN_SCALE) {
          setOffset(
            clampOffset({ x: dragStart.current.offset.x + deltaX, y: dragStart.current.offset.y + deltaY }, scale)
          );
        } else {
          // El giro sigue la dirección del arrastre: mover a la izquierda gira a la izquierda.
          const deltaFrames = Math.round(deltaX / DRAG_SENSITIVITY);
          setFrame(wrapFrame(dragStart.current.frame + deltaFrames));
        }
      }
    },
    [applyScale, clampOffset, scale]
  );

  const endPointer = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      setIsDragging(false);
      dragStart.current = null;
    }
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      applyScale(scale + direction * WHEEL_ZOOM_STEP);
    },
    [applyScale, scale]
  );

  const onDoubleClick = useCallback(() => {
    applyScale(scale > MIN_SCALE ? MIN_SCALE : 2);
  }, [applyScale, scale]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setFrame((f) => wrapFrame(f + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFrame((f) => wrapFrame(f - 1));
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    },
    [zoomIn, zoomOut, resetZoom]
  );

  return {
    frame,
    scale,
    offset,
    isDragging,
    isZoomed: scale > MIN_SCALE,
    containerRef,
    rotateBy,
    zoomIn,
    zoomOut,
    resetZoom,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onDoubleClick,
      onWheel,
    },
    keyboardHandlers: { onKeyDown },
  };
}
