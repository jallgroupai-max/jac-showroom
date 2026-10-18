import type { CSSProperties } from "react";

// Encuadre del 360° exterior en mobile/tablet, por vehículo y preset de
// pantalla. ÚNICA fuente de verdad: la usan el visor del showroom
// (sprite-viewer.tsx), la preview del paso "Posición en móvil" del panel, el
// esquema zod del servidor (schemas.ts) y el adapter del catálogo. Sin
// imports de servidor — viaja al bundle del cliente.
//
// Espejo de enum ViewerDevicePreset / modelo VehicleViewerPosition (Prisma).

export const VIEWER_PRESETS = ["PHONE_SMALL", "PHONE_STANDARD", "PHONE_TALL", "TABLET"] as const;
export type ViewerPreset = (typeof VIEWER_PRESETS)[number];

export type ViewerPosition = {
  /** Fracción del ANCHO del héroe: 0 centrado, + derecha. */
  offsetX: number;
  /** Línea de piso: fracción del ALTO del héroe desde abajo, + sube. */
  offsetY: number;
  /** Multiplicador de tamaño, origen abajo-centro. */
  scale: number;
};

/** Posiciones guardadas de un vehículo — un preset ausente = defaults. */
export type ViewerPositions = Partial<Record<ViewerPreset, ViewerPosition>>;

/** Mismos rangos que los CHECK de la migración (y que valida zod). */
export const VIEWER_LIMITS = {
  offsetX: { min: -0.5, max: 0.5, step: 0.005 },
  offsetY: { min: -0.25, max: 0.5, step: 0.005 },
  scale: { min: 0.5, max: 2.5, step: 0.01 },
} as const;

/** Encuadre de siempre (bottom-[3%] + scale-[1.25]): lo que se ve sin fila. */
export const DEFAULT_VIEWER_POSITION: ViewerPosition = { offsetX: 0, offsetY: 0.03, scale: 1.25 };

/** Viewport CSS de referencia de cada preset (ancho × alto). */
export const VIEWER_PRESET_INFO: Record<
  ViewerPreset,
  { label: string; device: string; width: number; height: number }
> = {
  PHONE_SMALL: { label: "Teléfono pequeño", device: "iPhone SE", width: 375, height: 548 },
  PHONE_STANDARD: { label: "Teléfono estándar", device: "iPhone 12–15", width: 390, height: 664 },
  PHONE_TALL: { label: "Teléfono alto", device: "Pixel 7 / Android 20:9", width: 412, height: 839 },
  TABLET: { label: "Tablet", device: "iPad 10ª gen", width: 820, height: 1106 },
};

const TABLET_MIN_WIDTH = 600;

/** Preset que le toca a un viewport VERTICAL por debajo de `lg`: ancho ≥ 600
 * → tablet; si no, el teléfono cuyo ratio alto/ancho de referencia sea el
 * más cercano al del viewport. */
export function pickViewerPreset(width: number, height: number): ViewerPreset {
  if (width >= TABLET_MIN_WIDTH) return "TABLET";
  const ratio = height / width;
  let best: ViewerPreset = "PHONE_STANDARD";
  let bestDiff = Infinity;
  for (const preset of VIEWER_PRESETS) {
    if (preset === "TABLET") continue;
    const info = VIEWER_PRESET_INFO[preset];
    const diff = Math.abs(info.height / info.width - ratio);
    if (diff < bestDiff) {
      best = preset;
      bestDiff = diff;
    }
  }
  return best;
}

export function clampViewerPosition(p: ViewerPosition): ViewerPosition {
  const c = (v: number, { min, max }: { min: number; max: number }) =>
    Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  return {
    offsetX: c(p.offsetX, VIEWER_LIMITS.offsetX),
    offsetY: c(p.offsetY, VIEWER_LIMITS.offsetY),
    scale: c(p.scale, VIEWER_LIMITS.scale),
  };
}

const pct = (fraction: number) => `${Number((fraction * 100).toFixed(3))}%`;

/**
 * LA fórmula de posicionamiento — compartida por el showroom y la preview.
 *
 *  - contenedor (`floor`): `bottom: offsetY * 100%`
 *  - div interno (`inner`): `translateX(offsetX * 100%) scale(scale)`,
 *    `transform-origin: bottom center`
 *
 * Valores por variables CSS para poder gatear con media queries sin JS:
 * por defecto (`always: false`) solo aplica bajo `lg` y desde `lg` vuelve al
 * comportamiento de escritorio (bottom 10%, sin transform). La preview del
 * panel corre en un viewport ancho, así que usa `always: true`.
 */
export function viewerLayerProps(position: ViewerPosition, always = false) {
  return {
    floor: {
      className: always ? "bottom-(--vp-bottom)" : "bottom-(--vp-bottom) lg:bottom-[10%]",
      style: { "--vp-bottom": pct(position.offsetY) } as CSSProperties,
    },
    // Tamaño del sprite dentro del div interno (70% del alto en mobile).
    sprite: {
      className: always ? "h-[70%] max-w-[100%]" : "h-[70%] max-w-[100%] lg:h-full lg:max-w-[82%]",
    },
    inner: {
      className: always
        ? "origin-bottom [transform:translateX(var(--vp-x))_scale(var(--vp-scale))]"
        : "origin-bottom [transform:translateX(var(--vp-x))_scale(var(--vp-scale))] lg:[transform:none]",
      style: {
        "--vp-x": pct(position.offsetX),
        "--vp-scale": String(position.scale),
      } as CSSProperties,
    },
  };
}
