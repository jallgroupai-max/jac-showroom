import type { CSSProperties } from "react";

// Encuadre del 360° exterior por vehículo y preset de pantalla: 4 presets
// mobile/tablet (< lg, vertical) y 3 de escritorio (>= lg). ÚNICA fuente de
// verdad: la usan el visor del showroom (sprite-viewer.tsx), la preview del
// paso "Posición del vehículo" del panel, el esquema zod del servidor
// (schemas.ts) y el adapter del catálogo. Sin imports de servidor — viaja al
// bundle del cliente.
//
// Espejo de enum ViewerDevicePreset / modelo VehicleViewerPosition (Prisma).

export const MOBILE_VIEWER_PRESETS = ["PHONE_SMALL", "PHONE_STANDARD", "PHONE_TALL", "TABLET"] as const;
export const DESKTOP_VIEWER_PRESETS = ["DESKTOP_LAPTOP", "DESKTOP_FHD", "DESKTOP_QHD"] as const;
/** Mismo orden que el enum de Postgres. */
export const VIEWER_PRESETS = [...MOBILE_VIEWER_PRESETS, ...DESKTOP_VIEWER_PRESETS] as const;

export type MobileViewerPreset = (typeof MOBILE_VIEWER_PRESETS)[number];
export type DesktopViewerPreset = (typeof DESKTOP_VIEWER_PRESETS)[number];
export type ViewerPreset = MobileViewerPreset | DesktopViewerPreset;

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

/** Encuadre mobile de siempre (bottom-[3%] + scale-[1.25]): lo que se ve sin fila. */
export const DEFAULT_VIEWER_POSITION: ViewerPosition = { offsetX: 0, offsetY: 0.03, scale: 1.25 };

/** Encuadre de escritorio de siempre (lg:bottom-[10%], sin transform). */
export const DEFAULT_DESKTOP_VIEWER_POSITION: ViewerPosition = { offsetX: 0, offsetY: 0.1, scale: 1 };

export const isDesktopPreset = (preset: ViewerPreset): preset is DesktopViewerPreset =>
  (DESKTOP_VIEWER_PRESETS as readonly string[]).includes(preset);

/** Default de código de un preset — NUNCA el de otro preset ni grupo. */
export const defaultViewerPosition = (preset: ViewerPreset): ViewerPosition =>
  isDesktopPreset(preset) ? DEFAULT_DESKTOP_VIEWER_POSITION : DEFAULT_VIEWER_POSITION;

/** Viewport CSS de referencia de cada preset (ancho × alto). En escritorio es
 * el viewport VISIBLE (con barras del navegador); el héroe es ese alto menos
 * el header (73px, medido en el showroom real). */
export const VIEWER_PRESET_INFO: Record<
  ViewerPreset,
  { label: string; device: string; width: number; height: number; group: "mobile" | "desktop" }
> = {
  PHONE_SMALL: { label: "Teléfono pequeño", device: "iPhone SE", width: 375, height: 548, group: "mobile" },
  PHONE_STANDARD: { label: "Teléfono estándar", device: "iPhone 12–15", width: 390, height: 664, group: "mobile" },
  PHONE_TALL: { label: "Teléfono alto", device: "Pixel 7 / Android 20:9", width: 412, height: 839, group: "mobile" },
  TABLET: { label: "Tablet", device: "iPad 10ª gen", width: 820, height: 1106, group: "mobile" },
  DESKTOP_LAPTOP: { label: "Laptop", device: "1024–1642 px de ancho", width: 1366, height: 625, group: "desktop" },
  DESKTOP_FHD: { label: "Full HD", device: "1643–2239 px de ancho", width: 1920, height: 945, group: "desktop" },
  DESKTOP_QHD: { label: "QHD / 2K", device: "desde 2240 px de ancho", width: 2560, height: 1305, group: "desktop" },
};

export const VIEWER_GROUPS = [
  { id: "mobile", label: "Móvil", presets: MOBILE_VIEWER_PRESETS },
  { id: "desktop", label: "PC", presets: DESKTOP_VIEWER_PRESETS },
] as const;

const TABLET_MIN_WIDTH = 600;

/** Preset que le toca a un viewport VERTICAL por debajo de `lg`: ancho ≥ 600
 * → tablet; si no, el teléfono cuyo ratio alto/ancho de referencia sea el
 * más cercano al del viewport.
 *
 * Escritorio (innerWidth ≥ 1024) NO se elige por JS: va por media queries en
 * viewerLayerProps (sin salto al hidratar), con el ancho más cercano a
 * 1366/1920/2560 → umbrales 1643 y 2240 (punto medio de cada par). */
export function pickViewerPreset(width: number, height: number): MobileViewerPreset {
  if (width >= TABLET_MIN_WIDTH) return "TABLET";
  const ratio = height / width;
  let best: MobileViewerPreset = "PHONE_STANDARD";
  let bestDiff = Infinity;
  for (const preset of MOBILE_VIEWER_PRESETS) {
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
const transformOf = (p: ViewerPosition) => `translateX(${pct(p.offsetX)}) scale(${p.scale})`;

// Sufijo de las variables CSS de cada preset de escritorio.
const DESKTOP_VAR: Record<DesktopViewerPreset, string> = {
  DESKTOP_LAPTOP: "lap",
  DESKTOP_FHD: "fhd",
  DESKTOP_QHD: "qhd",
};

/**
 * LA fórmula de posicionamiento — compartida por el showroom y la preview.
 *
 *  - contenedor (`floor`): `bottom: offsetY * 100%`
 *  - div interno (`inner`): `translateX(offsetX * 100%) scale(scale)`,
 *    `transform-origin: bottom center`
 *
 * Todo por variables CSS + media queries (sin JS → sin salto al hidratar):
 *  - bajo `lg`: `mobile` (el preset que ya eligió useViewerPreset).
 *  - desde `lg`: la fila del preset de escritorio que toque por ancho —
 *    laptop `min-[1024px]` (= lg), FHD `min-[1643px]`, QHD `min-[2240px]`.
 *    Los tres son variantes arbitrarias a propósito: Tailwind ordena las
 *    `min-[Npx]` ANTES que `lg:` en el CSS, y un `lg:` mezclado ganaría a los
 *    otros dos (el laptop pisaría a FHD/QHD). SIN fila =
 *    el comportamiento de siempre (bottom 10%, transform none); nunca se
 *    hereda de otro preset.
 */
export function viewerLayerProps(mobile: ViewerPosition, desktop: ViewerPositions = {}) {
  const floorVars: Record<string, string> = { "--vp-bottom": pct(mobile.offsetY) };
  const innerVars: Record<string, string> = {
    "--vp-x": pct(mobile.offsetX),
    "--vp-scale": String(mobile.scale),
  };
  for (const preset of DESKTOP_VIEWER_PRESETS) {
    const row = desktop[preset];
    const suffix = DESKTOP_VAR[preset];
    floorVars[`--vp-bottom-${suffix}`] = pct((row ?? DEFAULT_DESKTOP_VIEWER_POSITION).offsetY);
    innerVars[`--vp-t-${suffix}`] = row ? transformOf(row) : "none";
  }
  return {
    floor: {
      className:
        "bottom-(--vp-bottom) min-[1024px]:bottom-(--vp-bottom-lap) min-[1643px]:bottom-(--vp-bottom-fhd) min-[2240px]:bottom-(--vp-bottom-qhd)",
      style: floorVars as CSSProperties,
    },
    // Tamaño del sprite dentro del div interno (70% del alto en mobile).
    sprite: {
      className: "h-[70%] max-w-[100%] lg:h-full lg:max-w-[82%]",
    },
    inner: {
      className:
        "origin-bottom [transform:translateX(var(--vp-x))_scale(var(--vp-scale))] min-[1024px]:[transform:var(--vp-t-lap)] min-[1643px]:[transform:var(--vp-t-fhd)] min-[2240px]:[transform:var(--vp-t-qhd)]",
      style: innerVars as CSSProperties,
    },
  };
}

/** Misma fórmula para UN preset, sin media queries: la preview del panel corre
 * en un viewport ancho, así que fuerza el modo del preset que se edita. */
export function previewLayerProps(preset: ViewerPreset, position: ViewerPosition) {
  return {
    floor: {
      className: "bottom-(--vp-bottom)",
      style: { "--vp-bottom": pct(position.offsetY) } as CSSProperties,
    },
    sprite: {
      className: isDesktopPreset(preset) ? "h-full max-w-[82%]" : "h-[70%] max-w-[100%]",
    },
    inner: {
      className: "origin-bottom [transform:translateX(var(--vp-x))_scale(var(--vp-scale))]",
      style: { "--vp-x": pct(position.offsetX), "--vp-scale": String(position.scale) } as CSSProperties,
    },
  };
}
