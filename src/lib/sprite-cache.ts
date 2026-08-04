import type { Quality, SpriteSet } from "./types";
import { QUALITIES } from "./types";

// Caché de sesión — ver docs/TRD.md §4.2 (requisito confirmado): los sets de
// imágenes de vehículos ya visitados no deben volver a descargarse/recargarse
// al volver a ellos dentro de la misma sesión. Vive en scope de módulo (no en
// estado de React) para sobrevivir a remounts de componentes en la SPA.

const FRAME_COUNT = 36;

interface CacheEntry {
  loadedQualities: Set<Quality>;
  loadingPromises: Partial<Record<Quality, Promise<void>>>;
}

const sessionCache = new Map<string, CacheEntry>();

function getEntry(key: string): CacheEntry {
  let entry = sessionCache.get(key);
  if (!entry) {
    entry = { loadedQualities: new Set(), loadingPromises: {} };
    sessionCache.set(key, entry);
  }
  return entry;
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve();
    // Nunca romper la experiencia: un frame que falla no bloquea el resto.
    img.onerror = () => resolve();
    img.src = url;
  });
}

async function preloadQuality(key: string, spriteSet: SpriteSet, onFrame?: () => void): Promise<void> {
  const entry = getEntry(key);
  if (entry.loadedQualities.has(spriteSet.quality)) return;
  if (entry.loadingPromises[spriteSet.quality]) return entry.loadingPromises[spriteSet.quality];

  const promise = (async () => {
    // Los 36 frames se cargan EN PARALELO (con tope de concurrencia) — cargarlos
    // uno a uno secuencialmente los haría 36x más lentos sin ningún beneficio.
    const CONCURRENCY = 8;
    const frames = Array.from({ length: FRAME_COUNT }, (_, i) => i + 1);
    let cursor = 0;
    async function worker() {
      while (cursor < frames.length) {
        const frame = frames[cursor++];
        await preloadImage(spriteSet.frameUrl(frame));
        onFrame?.();
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    entry.loadedQualities.add(spriteSet.quality);
  })();

  entry.loadingPromises[spriteSet.quality] = promise;
  return promise;
}

export function isQualityCached(key: string, quality: Quality): boolean {
  return sessionCache.get(key)?.loadedQualities.has(quality) ?? false;
}

export function highestCachedQuality(key: string): Quality | null {
  const loaded = sessionCache.get(key)?.loadedQualities;
  if (!loaded || loaded.size === 0) return null;
  for (const q of [...QUALITIES].reverse()) {
    if (loaded.has(q)) return q;
  }
  return null;
}

/**
 * Orquesta la carga progresiva SIEMPRE en orden fijo low -> medium -> high
 * (ver docs/TRD.md §4.2). Salta las calidades ya cacheadas en esta sesión.
 * onProgress reporta (framesLoadedTotal, framesTotal) para el Loading real.
 */
export async function loadSpriteSetsProgressively(
  key: string,
  spriteSets: SpriteSet[],
  onProgress?: (loaded: number, total: number, currentQuality: Quality) => void,
  onQualityComplete?: (quality: Quality) => void
): Promise<void> {
  const ordered = QUALITIES.map((q) => spriteSets.find((s) => s.quality === q)).filter(
    (s): s is SpriteSet => Boolean(s)
  );
  const total = ordered.length * FRAME_COUNT;
  let loaded = 0;
  for (const set of ordered) {
    if (isQualityCached(key, set.quality)) {
      loaded += FRAME_COUNT;
      onProgress?.(loaded, total, set.quality);
      onQualityComplete?.(set.quality);
      continue;
    }
    await preloadQuality(key, set, () => {
      loaded++;
      onProgress?.(loaded, total, set.quality);
    });
    onQualityComplete?.(set.quality);
  }
}

export function spriteCacheKey(vehicleSlug: string, variantOrMode: string): string {
  return `${vehicleSlug}:${variantOrMode}`;
}
