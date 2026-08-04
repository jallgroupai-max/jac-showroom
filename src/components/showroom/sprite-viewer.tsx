"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import type { SpriteSet } from "@/lib/types";
import { MAX_SCALE, useVehicleViewer } from "@/hooks/use-vehicle-viewer";
import { useSpriteQuality } from "@/hooks/use-sprite-quality";
import { SceneBackground } from "./scene-background";
import { cn } from "@/lib/utils";

interface SpriteViewerProps {
  cacheKey: string;
  spriteSets: SpriteSet[];
  /** Alternativa a `backgroundColor` — foto de escena. */
  backgroundUrl?: string;
  /** Alternativa a `backgroundUrl` — fondo de color sólido. */
  backgroundColor?: string;
  className?: string;
  /** El Header flota fijo/transparente sobre este mismo espacio en ese modo
   * (showroom-app.tsx) — el pod de girar/zoom baja un poco para no quedar
   * debajo de sus botones (solo aplica desde `lg:`, ver más abajo). */
  isFullscreen?: boolean;
  /** false mientras el selector de catálogo está abierto — oculta el pod de
   * girar/zoom, que no tiene sentido mostrar sobre esa pantalla. */
  showControls?: boolean;
}

const ROTATE_STEP = 3; // frames por clic (~30°) en los botones manuales

/**
 * Núcleo del visualizador 360°: compone la Escena (fondo, capa separada) +
 * el sprite del vehículo (fondo transparente) encima, con rotación por
 * drag/teclado sobre el set de 36 frames de la mejor calidad ya cargada, más
 * zoom/pan (rueda, pellizco, doble clic o los botones +/-) — ver
 * docs/TRD.md §4.1-§4.5 y use-vehicle-viewer.ts. El toolbar de puntos de
 * interés y el hint de "360°" viven en showroom-app.tsx, agrupados con
 * VisualizerControls. En mobile/tablet (`<lg`) solo se muestran los
 * botones de girar, abajo a la derecha de la imagen (sin zoom); desde
 * `lg:` se agrega el zoom y el pod se centra arriba del héroe.
 */
export function SpriteViewer({
  cacheKey,
  spriteSets,
  backgroundUrl,
  backgroundColor,
  className,
  isFullscreen,
  showControls = true,
}: SpriteViewerProps) {
  const {
    frame,
    scale,
    offset,
    isDragging,
    isZoomed,
    containerRef,
    rotateBy,
    zoomIn,
    zoomOut,
    pointerHandlers,
    keyboardHandlers,
  } = useVehicleViewer(1);
  const { bestQuality } = useSpriteQuality(cacheKey, spriteSets);

  const frameUrl = useMemo(() => {
    if (!bestQuality) return null;
    const set = spriteSets.find((s) => s.quality === bestQuality);
    return set ? set.frameUrl(frame) : null;
  }, [bestQuality, frame, spriteSets]);

  return (
    <div
      ref={containerRef}
      role="slider"
      aria-label="Rotar y hacer zoom sobre el vehículo. Arrastra para rotar, usa la rueda del mouse o pellizca para acercar, y arrastra con zoom aplicado para desplazar la vista."
      aria-valuemin={1}
      aria-valuemax={36}
      aria-valuenow={frame}
      tabIndex={0}
      className={cn(
        "relative h-full w-full touch-none select-none outline-none",
        isDragging ? "cursor-grabbing" : "cursor-grab",
        className
      )}
      {...pointerHandlers}
      {...keyboardHandlers}
    >
      <motion.div
        className="absolute inset-0"
        animate={{ scale, x: offset.x, y: offset.y }}
        transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.5 }}
      >
        <SceneBackground imageUrl={backgroundUrl} color={backgroundColor} />

        <div className="absolute inset-0 flex items-end justify-center ">
          {frameUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- secuencia de frames servida directo, no encaja con next/image
            <img
              src={frameUrl}
              alt="Vista del vehículo"
              draggable={false}
              className="pointer-events-none h-[85%] max-w-[90%] object-contain drop-shadow-2xl lg:h-[92%] lg:max-w-[82%]"
            />
          ) : (
            <div className="h-16 w-16 animate-pulse rounded-full bg-white/40" aria-hidden />
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2 transition-[top] duration-300 ease-in-out lg:bottom-auto lg:right-auto lg:inset-x-0 lg:mx-auto lg:w-full lg:max-w-6xl",
              isFullscreen ? "lg:top-20" : "lg:top-4"
            )}
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  rotateBy(-ROTATE_STEP);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Girar a la izquierda"
                title="Girar a la izquierda"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#12141A] shadow-md backdrop-blur transition-all hover:scale-105 hover:bg-[#111318] hover:text-white focus-visible:bg-[#111318] focus-visible:text-white focus-visible:outline-none"
              >
                <RotateCcw className="h-4 w-4 -rotate-12" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  rotateBy(ROTATE_STEP);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Girar a la derecha"
                title="Girar a la derecha"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#12141A] shadow-md backdrop-blur transition-all hover:scale-105 hover:bg-[#111318] hover:text-white focus-visible:bg-[#111318] focus-visible:text-white focus-visible:outline-none"
              >
                <RotateCw className="h-4 w-4 rotate-12" />
              </button>
            </div>

            <div className="hidden gap-2 lg:flex">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  zoomIn();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={scale >= MAX_SCALE}
                aria-label="Acercar"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#12141A] shadow-md backdrop-blur transition-all hover:scale-105 hover:bg-[#111318] hover:text-white focus-visible:bg-[#111318] focus-visible:text-white focus-visible:outline-none disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-white/90 disabled:hover:text-[#12141A]"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  zoomOut();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={!isZoomed}
                aria-label="Alejar"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#12141A] shadow-md backdrop-blur transition-all hover:scale-105 hover:bg-[#111318] hover:text-white focus-visible:bg-[#111318] focus-visible:text-white focus-visible:outline-none disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-white/90 disabled:hover:text-[#12141A]"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
