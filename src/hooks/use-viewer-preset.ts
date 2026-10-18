"use client";

import { useSyncExternalStore } from "react";
import { pickViewerPreset, type MobileViewerPreset } from "@/lib/viewer-position";

// Preset MOBILE que le toca al dispositivo (ver pickViewerPreset). Solo aplica
// bajo `lg` (< 1024px) y en vertical: en escritorio u horizontal devuelve null.
// Los presets de ESCRITORIO no pasan por aquí: se resuelven con variables CSS +
// media queries (viewerLayerProps), así el encuadre es correcto desde el primer
// pintado, sin esperar a hidratar.
//
// useSyncExternalStore (patrón del repo para matchMedia, ver showroom-app):
// sin efecto ni setState-en-efecto. El snapshot es un string primitivo, así
// que React solo re-renderiza cuando el preset cambia de verdad. En SSR/
// hidratación devuelve "" (= sin preset) y corrige apenas hidrata.

const DESKTOP_QUERY = "(min-width: 1024px)";
const PORTRAIT_QUERY = "(orientation: portrait)";

function subscribe(callback: () => void): () => void {
  window.addEventListener("resize", callback);
  window.addEventListener("orientationchange", callback);
  return () => {
    window.removeEventListener("resize", callback);
    window.removeEventListener("orientationchange", callback);
  };
}

function getSnapshot(): MobileViewerPreset | "" {
  if (window.matchMedia(DESKTOP_QUERY).matches) return "";
  if (!window.matchMedia(PORTRAIT_QUERY).matches) return "";
  return pickViewerPreset(window.innerWidth, window.innerHeight);
}

export function useViewerPreset(): MobileViewerPreset | null {
  const preset = useSyncExternalStore(subscribe, getSnapshot, () => "" as const);
  return preset === "" ? null : preset;
}
