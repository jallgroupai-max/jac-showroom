"use client";

import { useEffect, useState } from "react";
import type { Quality, SpriteSet } from "@/lib/types";
import { QUALITIES } from "@/lib/types";
import { readyThresholdForTier, useConnectionTier } from "@/lib/connection";
import { useSpriteQuality } from "@/hooks/use-sprite-quality";

interface LoadingScreenProps {
  cacheKey: string;
  spriteSets: SpriteSet[];
  onReady: () => void;
}

function qualityIndex(q: Quality | null): number {
  return q ? QUALITIES.indexOf(q) : -1;
}

/**
 * Ver docs/APP-FLOW.md §3.1 y docs/TRD.md §4.2. Progreso REAL (no simulado),
 * ligado a la descarga efectiva de los sprites del vehículo objetivo. La
 * calidad de conexión decide cuánto se espera aquí antes de considerar la
 * carga lista (readyThresholdForTier) — el resto sigue cargando en segundo
 * plano de forma transparente dentro del visualizador. Al llegar a ese punto
 * el porcentaje se muestra como 100% y aparece el botón "Ingresar": la
 * entrada al showroom es MANUAL (clic del usuario), no automática.
 */
export function LoadingScreen({ cacheKey, spriteSets, onReady }: LoadingScreenProps) {
  // Se mide el throughput real descargando el primer frame en baja calidad.
  const sampleUrl = spriteSets.find((s) => s.quality === "low")?.frameUrl(1);
  const tier = useConnectionTier(sampleUrl);
  const { bestQuality, progress } = useSpriteQuality(cacheKey, spriteSets);
  const [isReady, setIsReady] = useState(false);

  const threshold = readyThresholdForTier(tier);

  useEffect(() => {
    if (isReady) return;
    if (qualityIndex(bestQuality) >= qualityIndex(threshold)) {
      setIsReady(true);
    }
  }, [bestQuality, threshold, isReady]);

  // El 100% queda reservado para el estado "listo": mientras no se alcance
  // el umbral, el porcentaje real se topa en 99 para que el 100% y el botón
  // aparezcan siempre juntos.
  const percent = isReady ? 100 : Math.min(99, Math.round(progress * 100));

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F4F6F9] px-6 text-center">
      <span className="text-2xl font-bold tracking-tight text-[#12141A]">JAC</span>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#6B7280]">
        Iniciando servidores…
      </p>
      <p className="mt-4 text-5xl font-extrabold text-[#12141A]">{percent}%</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#6B7280]">Loading</p>

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
