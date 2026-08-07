import type { Quality, SpriteSet } from "./types";
import { QUALITIES } from "./types";

// Caché de sesión — ver docs/TRD.md §4.2 (requisito confirmado): los sets de
// imágenes de vehículos ya visitados no deben volver a descargarse/recargarse
// al volver a ellos dentro de la misma sesión. Vive en scope de módulo (no en
// estado de React) para sobrevivir a remounts de componentes en la SPA.

export const FRAME_COUNT = 36;

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

// Toda imagen precargada queda RETENIDA aquí de por vida de la sesión. Sin
// una referencia viva, el navegador puede soltar el recurso de su caché en
// memoria y cada <img> que después usa la misma URL vuelve a la red (o a
// revalidar — los assets de /public se sirven con revalidación): por eso las
// cards del catálogo, los thumbnails de color y los backgrounds aparecían de
// a poco en runtime pese a la precarga del Loading. Con la referencia viva,
// el recurso se reutiliza al instante.
const retainedImages = new Map<string, HTMLImageElement>();

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const existing = retainedImages.get(url);
    if (existing) {
      if (existing.complete) return resolve();
      // addEventListener (no onload=): la promesa original del mismo recurso
      // conserva sus propios handlers — nadie pisa a nadie.
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
      return;
    }
    const img = new window.Image();
    retainedImages.set(url, img);
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
    const CONCURRENCY = 12;
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
  // Con una calidad ya cacheada, descargar las INFERIORES no aporta nada
  // visible (bestQuality nunca baja) — se saltan sin tocar la red. Ahorra
  // p. ej. bajar low+medium de un color que ya está en high.
  const best = highestCachedQuality(key);
  const bestIdx = best ? QUALITIES.indexOf(best) : -1;
  for (const set of ordered) {
    if (isQualityCached(key, set.quality) || QUALITIES.indexOf(set.quality) < bestIdx) {
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

/**
 * Carga SOLO el set de la calidad pedida (la del umbral de conexión) para un
 * color — es la carga del Loading inicial: UN único set completo por color
 * basta para entrar y para el barrido de cambio de color, y descargar además
 * las calidades inferiores triplicaba el peso del Loading sin beneficio
 * (bestQuality nunca las mostraría). El resto de calidades baja después en
 * segundo plano (loadSpriteSetsProgressively). onProgress reporta
 * (framesLoaded, framesTotal) del set.
 */
export async function loadSpriteSetQuality(
  key: string,
  spriteSets: SpriteSet[],
  quality: Quality,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  // Fallback defensivo: sin el set exacto, se usa el mejor disponible que no
  // supere la calidad pedida (o el primero que haya).
  const maxIdx = QUALITIES.indexOf(quality);
  const set =
    spriteSets.find((s) => s.quality === quality) ??
    [...spriteSets].reverse().find((s) => QUALITIES.indexOf(s.quality) < maxIdx) ??
    spriteSets[0];
  if (!set) return;
  if (isQualityCached(key, set.quality)) {
    onProgress?.(FRAME_COUNT, FRAME_COUNT);
    return;
  }
  let loaded = 0;
  onProgress?.(0, FRAME_COUNT);
  await preloadQuality(key, set, () => {
    loaded++;
    onProgress?.(loaded, FRAME_COUNT);
  });
  // Ajuste exacto al cierre: si la descarga real la hizo otra invocación
  // concurrente (dedup de loadingPromises), los onFrame no llegan a este
  // llamador — el conteo se corrige al valor cierto.
  onProgress?.(FRAME_COUNT, FRAME_COUNT);
}

/**
 * Precarga una lista de imágenes sueltas (cards del catálogo, íconos,
 * backgrounds de escena) con tope de concurrencia. Un asset que falla no
 * bloquea: cuenta como cargado (mismo criterio que preloadImage — nunca
 * romper la experiencia). onProgress reporta (loaded, total).
 */
export async function preloadStaticAssets(
  urls: string[],
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  const CONCURRENCY = 6;
  const total = urls.length;
  let cursor = 0;
  let loaded = 0;
  onProgress?.(0, total);
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      await preloadImage(url);
      loaded++;
      onProgress?.(loaded, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, total)) }, () => worker()));
}

// ——— Frames decodificados en memoria ———
// El caché HTTP conserva los BYTES de cada frame, pero el bitmap DECODIFICADO
// se descarta si ningún elemento lo referencia: al girar, cada frame nuevo se
// re-decodificaba en el hilo principal — ese lag hacía sentir el 360 "pegado"
// y provocaba saltos de varios frames al ponerse al día. Mantener vivos los
// HTMLImageElement ya decode()ados de los sets en uso hace el pintado
// instantáneo. Tope acotado (LRU) para no acumular los bitmaps de todos los
// colores/calidades visitados en la sesión.
const MAX_WARM_SETS = 3;
const warmSets = new Map<string, HTMLImageElement[]>();

export function warmDecodedFrames(setKey: string, spriteSet: SpriteSet): void {
  const existing = warmSets.get(setKey);
  if (existing) {
    // Ya calentado: solo refresca su recencia en la cola LRU.
    warmSets.delete(setKey);
    warmSets.set(setKey, existing);
    return;
  }
  const imgs: HTMLImageElement[] = [];
  warmSets.set(setKey, imgs);
  while (warmSets.size > MAX_WARM_SETS) {
    const oldest = warmSets.keys().next().value;
    if (oldest === undefined || oldest === setKey) break;
    warmSets.delete(oldest);
  }
  for (let frame = 1; frame <= FRAME_COUNT; frame++) {
    const url = spriteSet.frameUrl(frame);
    // Reutiliza la imagen ya retenida por la precarga (mismo recurso vivo,
    // sin nueva petición); si no existe, se crea y retiene acá mismo.
    let img = retainedImages.get(url);
    if (!img) {
      img = new window.Image();
      img.src = url;
      retainedImages.set(url, img);
    }
    // decode() rechaza p. ej. ante un 404 — nunca romper la experiencia.
    img.decode().catch(() => {});
    imgs.push(img);
  }
}

export function spriteCacheKey(vehicleSlug: string, variantOrMode: string): string {
  return `${vehicleSlug}:${variantOrMode}`;
}
