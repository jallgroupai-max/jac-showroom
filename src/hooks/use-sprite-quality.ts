"use client";

import { useEffect, useState } from "react";
import type { Quality, SpriteSet } from "@/lib/types";
import { QUALITIES } from "@/lib/types";
import { highestCachedQuality, loadSpriteSetsProgressively } from "@/lib/sprite-cache";

interface UseSpriteQualityResult {
  /** Mejor calidad ya disponible para renderizar (mejora en vivo, nunca baja). */
  bestQuality: Quality | null;
  /** Progreso 0..1 de la carga completa (las 3 calidades, 108 frames). */
  progress: number;
  /** true cuando el set completo (low+medium+high) terminó de cargar. */
  isFullyLoaded: boolean;
}

/**
 * Dispara la carga progresiva SIEMPRE low->medium->high (docs/TRD.md §4.2)
 * para un set de sprites, reutilizando lo que ya esté cacheado en la sesión
 * (docs/TRD.md §4.2, caché de sesión). Nunca bloquea: bestQuality arranca en
 * null y va subiendo a medida que cada calidad termina.
 */
export function useSpriteQuality(cacheKey: string, spriteSets: SpriteSet[]): UseSpriteQualityResult {
  const [bestQuality, setBestQuality] = useState<Quality | null>(() => highestCachedQuality(cacheKey));
  const [progress, setProgress] = useState(() => (highestCachedQuality(cacheKey) ? 1 : 0));

  // Reset SINCRÓNICO al cambiar de set (patrón React "derive state during
  // render", sin render intermedio con datos viejos): bestQuality es
  // monótona-creciente DENTRO de un mismo set, pero al cambiar de
  // color/vehículo debe re-partir de lo realmente cacheado del set NUEVO.
  // Arrastrar la calidad del set anterior hacía que activeSet apuntara a
  // frames aún no descargados: el vehículo desaparecía al cambiar de color y
  // el giro quedaba pegado/saltando entre los pocos frames ya bajados.
  const [prevKey, setPrevKey] = useState(cacheKey);
  if (prevKey !== cacheKey) {
    setPrevKey(cacheKey);
    const cached = highestCachedQuality(cacheKey);
    setBestQuality(cached);
    setProgress(cached ? 1 : 0);
  }

  // Se llama en cada montaje/cambio de cacheKey (incluido el doble-invocado de
  // efectos de React StrictMode en desarrollo). Es seguro e idempotente: la
  // deduplicación real vive en sprite-cache.ts (loadingPromises/loadedQualities),
  // no acá — por eso NO se usa un ref para "ya empecé" (eso rompía la carga
  // bajo StrictMode: la invocación que sobrevive terminaba sin disparar nada
  // porque el ref ya había sido marcado por la invocación fantasma).
  useEffect(() => {
    let cancelled = false;
    loadSpriteSetsProgressively(
      cacheKey,
      spriteSets,
      (loaded, total) => {
        if (!cancelled) setProgress(loaded / total);
      },
      (completedQuality) => {
        if (cancelled) return;
        setBestQuality((prev) => {
          const order: Quality[] = QUALITIES;
          if (!prev) return completedQuality;
          return order.indexOf(completedQuality) > order.indexOf(prev) ? completedQuality : prev;
        });
      }
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { bestQuality, progress, isFullyLoaded: progress >= 1 };
}
