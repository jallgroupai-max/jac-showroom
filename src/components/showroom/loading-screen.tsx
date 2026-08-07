"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Vehicle } from "@/lib/types";
import { readyThresholdForTier, useConnectionTier } from "@/lib/connection";
import { getPreloadAssetUrls } from "@/lib/mock-data";
import {
  FRAME_COUNT,
  loadSpriteSetQuality,
  loadSpriteSetsProgressively,
  preloadStaticAssets,
  spriteCacheKey,
} from "@/lib/sprite-cache";

/** Logo para el Loading — con fallback al texto "JAC" si el archivo aún no
 * existe en /public (mismo estilo que el logo de texto del header). */
const LOGO_URL = "/assets/logo.png";

interface LoadingScreenProps {
  /** Vehículo inicial — se precargan TODOS sus colores antes de entrar. */
  vehicle: Vehicle;
  onReady: () => void;
}

/**
 * Ver docs/APP-FLOW.md §3.1 y docs/TRD.md §4.2. Progreso REAL (no simulado):
 * el 100% exige que TODO lo visible al entrar esté descargado —
 * 1) los 36 frames de TODOS los colores del vehículo inicial, EN la calidad
 *    que dicta la velocidad de conexión (readyThresholdForTier) — un único
 *    set por color: bajar además las calidades inferiores triplicaba la
 *    espera sin aportar nada visible; las demás calidades siguen cargando
 *    en segundo plano, de forma transparente;
 * 2) los assets estáticos: la imagen de la card de CADA vehículo del
 *    catálogo, los íconos (cards + puntos de interés) y los backgrounds de
 *    escena (claro/oscuro y "propio").
 * Recién al llegar a 100% aparece el botón "Ingresar": la entrada al
 * showroom es MANUAL (clic del usuario), no automática.
 */
export function LoadingScreen({ vehicle, onReady }: LoadingScreenProps) {
  // Se mide el throughput real descargando el primer frame en baja calidad.
  const sampleUrl = vehicle.variants[0]?.exteriorSprites
    .find((s) => s.quality === "low")
    ?.frameUrl(1);
  const tier = useConnectionTier(sampleUrl);
  const threshold = readyThresholdForTier(tier);

  const staticAssets = useMemo(() => getPreloadAssetUrls(), []);
  const [staticLoaded, setStaticLoaded] = useState(0);
  const [staticDone, setStaticDone] = useState(false);
  const [spriteLoaded, setSpriteLoaded] = useState(0);
  const [spritesDone, setSpritesDone] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  // UN set de 36 frames por color (solo la calidad del umbral — las demás
  // bajan en segundo plano): el total no depende del umbral, siempre son
  // 36 frames por cada color con modelo 360°.
  const spriteTotal = useMemo(
    () => vehicle.variants.filter((v) => v.exteriorSprites.length > 0).length * FRAME_COUNT,
    [vehicle]
  );

  useEffect(() => {
    let cancelled = false;
    preloadStaticAssets(staticAssets, (loaded) => {
      if (!cancelled) setStaticLoaded(loaded);
    }).then(() => {
      if (!cancelled) setStaticDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [staticAssets]);

  useEffect(() => {
    let cancelled = false;
    setSpritesDone(false);
    // Cada variante reporta su progreso propio y acá se agrega la suma. La
    // carga es SECUENCIAL y en orden: el color por defecto (variants[0])
    // primero — es el que se ve al entrar — y después el resto de colores.
    const perVariant = new Map<string, number>();
    const report = () => {
      if (cancelled) return;
      let sum = 0;
      perVariant.forEach((n) => {
        sum += n;
      });
      setSpriteLoaded(sum);
    };
    (async () => {
      for (const v of vehicle.variants) {
        if (cancelled) return;
        await loadSpriteSetQuality(
          spriteCacheKey(vehicle.slug, v.id),
          v.exteriorSprites,
          threshold,
          (loaded) => {
            perVariant.set(v.id, loaded);
            report();
          }
        );
      }
      if (!cancelled) setSpritesDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicle, threshold]);

  // isReady es un latch: una vez alcanzado el 100% no se retrocede aunque el
  // umbral de conexión cambie después.
  useEffect(() => {
    if (!isReady && spritesDone && staticDone) setIsReady(true);
  }, [spritesDone, staticDone, isReady]);

  // Con el 100% alcanzado, las calidades que quedaron POR ENCIMA del umbral
  // siguen bajando en segundo plano para TODOS los colores (0001..0036 de
  // cada uno) — así el cambio de color dentro del visualizador tampoco
  // espera por las calidades altas. La carga vive en sprite-cache (scope de
  // módulo): sobrevive al desmontaje de esta pantalla cuando el usuario
  // entra, y el dedup del caché evita repetir lo ya descargado.
  useEffect(() => {
    if (!isReady) return;
    for (const v of vehicle.variants) {
      loadSpriteSetsProgressively(spriteCacheKey(vehicle.slug, v.id), v.exteriorSprites);
    }
  }, [isReady, vehicle]);

  // El 100% queda reservado para el estado "listo": mientras falte CUALQUIER
  // asset (sprites de algún color, cards, íconos o backgrounds), el
  // porcentaje real se topa en 99 para que el 100% y el botón aparezcan
  // siempre juntos.
  const total = spriteTotal + staticAssets.length;
  const loaded = spriteLoaded + staticLoaded;
  const percent = isReady ? 100 : total === 0 ? 99 : Math.min(99, Math.round((loaded / total) * 100));

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F4F6F9] px-6 text-center">
      {logoFailed ? (
        // Aún sin arte final en /assets/logo.png: texto con el mismo estilo
        // que el logo del header.
        <span className="text-2xl font-black italic tracking-tighter text-[#12141A]">JAC</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- logo servido directo desde /public
        <img src={LOGO_URL} alt="JAC" className="h-12 w-auto" onError={() => setLogoFailed(true)} />
      )}
      {/* Ambos rótulos PARPADEAN (opacity 0.2 <-> 1) mientras dura la carga
          y desaparecen al llegar al 100% — con fade, y conservando su lugar
          en el layout para que nada salte. */}
      <motion.p
        animate={isReady ? { opacity: 0 } : { opacity: [0.2, 1, 0.2] }}
        transition={
          isReady
            ? { duration: 0.3, ease: "easeOut" }
            : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
        }
        className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#6B7280]"
      >
        Iniciando servidores…
      </motion.p>
      <p className="mt-4 text-5xl font-extrabold text-[#12141A]">{percent}%</p>
      <motion.p
        animate={isReady ? { opacity: 0 } : { opacity: [0.2, 1, 0.2] }}
        transition={
          isReady
            ? { duration: 0.3, ease: "easeOut" }
            : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
        }
        className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#6B7280]"
      >
        Loading
      </motion.p>

      <div className="mt-6 h-2 w-[280px] max-w-[70vw] overflow-hidden rounded-full bg-[#E3E5EA]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-live="polite">
        <div
          className="h-full rounded-full bg-[#111318] transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-6 max-w-sm text-sm leading-relaxed text-[#6B7280]">
        Prepárate para explorar nuestro salón virtual 360° una experiencia completamente inmersiva.
        <br />
        La carga toma de 30 a 60 segundos dependiendo de tu dispositivo y conexión.
      </p>

      {/* Slot de alto fijo: el botón aparece al 100% sin desplazar el layout. */}
      <div className="mt-8 flex h-12 items-center justify-center">
        {isReady && (
          <button
            type="button"
            onClick={onReady}
            className="animate-pulse rounded-full border-2 border-[#111318] bg-transparent px-10 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#111318] transition-transform active:scale-95"
          >
            Ingresar
          </button>
        )}
      </div>
    </div>
  );
}
