"use client";

import { useCallback, useState } from "react";

interface UseFullscreenResult {
  isFullscreen: boolean;
  toggleFullscreen: () => void;
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
  return { isFullscreen, toggleFullscreen };
}
