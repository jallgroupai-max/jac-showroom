"use client";

import { useCallback, useState } from "react";

interface UseFullscreenResult {
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  /** Fuerza a apagado — usado cuando el celular vuelve a vertical (ver
   * showroom-app.tsx): "pantalla completa" solo tiene sentido en desktop o
   * en mobile horizontal, así que al rotar de vuelta a portrait se
   * desactiva sola. Idempotente: llamarla ya estando apagado no hace nada. */
  exitFullscreen: () => void;
}

/**
 * NO es la Fullscreen API nativa del navegador (esa dispara el aviso propio
 * del navegador — "Para salir de pantalla completa, presiona Esc" — que no
 * es lo que se pidió). Es un simple toggle de UI: showroom-app.tsx usa
 * `isFullscreen` para fijar el Header (`position: fixed`) y maximizar el
 * área del visualizador dentro de la propia página.
 */
export function useFullscreen(): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => setIsFullscreen((current) => !current), []);
  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);
  return { isFullscreen, toggleFullscreen, exitFullscreen };
}
