"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import type { SpriteSet } from "@/lib/types";
import { UNAVAILABLE_VEHICLE_IMAGE } from "@/lib/mock-data";
import { FRAME_COUNT, warmDecodedFrames } from "@/lib/sprite-cache";
import { MAX_SCALE, useVehicleViewer } from "@/hooks/use-vehicle-viewer";
import { useSpriteQuality } from "@/hooks/use-sprite-quality";
import { SceneBackground } from "./scene-background";
import { cn } from "@/lib/utils";

interface SpriteViewerProps {
  cacheKey: string;
  /** Identidad del VEHÍCULO (slug). Cuando cambia, la transición es un
   * crossfade del vehículo completo (fade out del viejo + fade in del
   * nuevo); el barrido de color queda reservado para cambios de cacheKey
   * con el MISMO vehicleKey (cambio de color/vista del mismo vehículo). */
  vehicleKey?: string;
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
  /** Se dispara UNA sola vez, la primera vez que el usuario rota el vehículo
   * (drag, botones de girar o flechas) — usado por el hint de "360°". */
  onFirstRotate?: () => void;
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
  vehicleKey,
  spriteSets,
  backgroundUrl,
  backgroundColor,
  className,
  isFullscreen,
  showControls = true,
  onFirstRotate,
}: SpriteViewerProps) {
  // Barrido de cambio de color en TRES fases: "preload" (esperar el frame
  // visible del set nuevo — nunca barrer hacia una imagen a medio bajar),
  // "sweep" (el color nuevo barre de izquierda a derecha sobre la capa
  // anterior, que queda SÓLIDA debajo) y "fade" (con el color nuevo ya
  // mostrado por completo, la capa saliente se desvanece con un fade de
  // opacidad — nada desaparece de golpe). Mientras la transición exista
  // (wipe !== null) la ROTACIÓN queda bloqueada — drag, botones y flechas —
  // y se libera recién cuando el fade final desmonta la capa saliente.
  const [wipe, setWipe] = useState<{ fromSet: SpriteSet; phase: "preload" | "sweep" | "fade" } | null>(null);

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
  } = useVehicleViewer(1, wipe !== null);
  const { bestQuality } = useSpriteQuality(cacheKey, spriteSets);

  // Vehículo sin modelo 360° ({modelo}/{color}/{quality} inexistente):
  // sin sets no hay nada que rotar — silueta compartida + aviso.
  const unavailable = spriteSets.length === 0;

  // El frame arranca en 1: el primer cambio (por drag, botones o teclado)
  // cuenta como "el usuario ya rotó" y se notifica una única vez.
  const firstRotateNotified = useRef(false);
  useEffect(() => {
    if (frame === 1 || firstRotateNotified.current) return;
    firstRotateNotified.current = true;
    onFirstRotate?.();
  }, [frame, onFirstRotate]);

  const activeSet = useMemo(() => {
    if (!bestQuality) return null;
    return spriteSets.find((s) => s.quality === bestQuality) ?? null;
  }, [bestQuality, spriteSets]);
  const frameUrl = activeSet ? activeSet.frameUrl(frame) : null;

  // Pre-decodifica y mantiene vivos los frames del set activo (ver
  // warmDecodedFrames): sin esto, girar re-decodificaba cada frame en el
  // hilo principal — el 360 se sentía pegado y daba saltos al recuperarse.
  useEffect(() => {
    if (activeSet) warmDecodedFrames(`${cacheKey}:${activeSet.quality}`, activeSet);
  }, [activeSet, cacheKey]);

  const prevKeyRef = useRef(cacheKey);
  const prevVehicleRef = useRef(vehicleKey);
  const lastSetRef = useRef<SpriteSet | null>(null);

  useEffect(() => {
    const vehicleChanged = prevVehicleRef.current !== vehicleKey;
    prevVehicleRef.current = vehicleKey;
    if (prevKeyRef.current === cacheKey) return;
    prevKeyRef.current = cacheKey;
    if (vehicleChanged) {
      // Cambio de VEHÍCULO: la transición es el crossfade del AnimatePresence
      // de abajo, no el barrido de color — se cancela cualquier barrido en
      // curso para no barrer entre vehículos distintos.
      setWipe(null);
      return;
    }
    if (lastSetRef.current) setWipe({ fromSet: lastSetRef.current, phase: "preload" });
  }, [cacheKey, vehicleKey]);

  // Declarado DESPUÉS del efecto de arriba a propósito: ambos corren tras el
  // mismo render y aquel necesita leer todavía el set del render anterior.
  useEffect(() => {
    if (activeSet) lastSetRef.current = activeSet;
  }, [activeSet]);

  useEffect(() => {
    if (!wipe || wipe.phase !== "preload" || !frameUrl) return;
    let cancelled = false;
    const img = new window.Image();
    const done = () => {
      if (!cancelled) setWipe((w) => (w && w.phase === "preload" ? { ...w, phase: "sweep" } : w));
    };
    img.onload = done;
    img.onerror = done;
    img.src = frameUrl;
    return () => {
      cancelled = true;
    };
  }, [wipe, frameUrl]);

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

        {/* Cambio de VEHÍCULO = crossfade: la capa del vehículo saliente
            (congelada en su último frame) se desvanece mientras la del nuevo
            aparece — el fondo de escena NO participa del fade, solo el
            vehículo (o la silueta de "no disponible").
            bottom-[10%]: el vehículo se apoya en una "línea de piso" un 10%
            por encima del borde inferior del héroe, para que no quede pegado
            a los controles flotantes de abajo (va a la par del object-bottom
            del fondo en scene-background.tsx). */}
        <AnimatePresence initial={false}>
          <motion.div
            key={vehicleKey ?? "vehicle"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="absolute inset-x-0 top-0 bottom-[10%] flex items-end justify-center"
          >
          {/* En mobile el vehículo se AGRANDA con un scale (origen abajo,
              apoyado en la línea de piso): en pantallas angostas el frame ya
              toca el 100% del ancho y aumentar solo la altura no lo hacía
              más grande — el scale sí, a costa de un leve recorte lateral
              que el héroe (overflow-hidden) absorbe. En desktop queda 1:1.
              Va en un div PROPIO (no en las capas motion.img del barrido):
              framer-motion pisa el transform de los elementos que anima. */}
          <div className="flex h-full w-full origin-bottom scale-[1.25] items-end justify-center lg:scale-100">
          {unavailable ? (
            <div className="relative flex h-[90%] max-w-[100%] translate-y-[6%] items-center justify-center lg:h-full lg:max-w-[82%]">
              {/* eslint-disable-next-line @next/next/no-img-element -- silueta compartida servida directo */}
              <img
                src={UNAVAILABLE_VEHICLE_IMAGE}
                alt=""
                aria-hidden
                draggable={false}
                className="pointer-events-none h-[62.5%] w-auto max-w-full object-contain"
              />
              <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xl font-extrabold uppercase tracking-widest text-white sm:text-2xl">
                Vehículo no disponible
              </p>
            </div>
          ) : activeSet && frameUrl ? (
            wipe ? (
              <>
                {/* Capa saliente (color anterior): SÓLIDA mientras el barrido
                    la cubre, congelada en el frame vigente (la rotación queda
                    bloqueada durante toda la transición). Al terminar el
                    barrido, con el color nuevo ya mostrado por completo, se
                    desvanece con un fade de opacidad y recién al completarlo
                    se desmonta todo — ahí se libera la rotación. */}
                <motion.img
                  src={wipe.fromSet.frameUrl(frame)}
                  alt="Vista del vehículo"
                  draggable={false}
                  initial={false}
                  animate={{ opacity: wipe.phase === "fade" ? 0 : 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  onAnimationComplete={() => {
                    if (wipe.phase === "fade") setWipe(null);
                  }}
                  className="pointer-events-none h-[90%] max-w-[100%] object-contain drop-shadow-2xl lg:h-full lg:max-w-[82%]"
                />
                {/* El color nuevo entra con barrido + fade 0 -> 1 sobre la
                    capa saliente: la zona ya barrida se va solidificando
                    mientras el resto conserva el color anterior intacto. */}
                <motion.img
                  key={cacheKey}
                  src={frameUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                  animate={
                    wipe.phase === "preload"
                      ? { clipPath: "inset(0 100% 0 0)", opacity: 0 }
                      : { clipPath: "inset(0 0% 0 0)", opacity: 1 }
                  }
                  transition={{ duration: 0.85, ease: "easeInOut" }}
                  onAnimationComplete={() => {
                    if (wipe.phase === "sweep") setWipe((w) => (w ? { ...w, phase: "fade" } : w));
                  }}
                  className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-[90%] max-w-[100%] object-contain drop-shadow-2xl lg:h-full lg:max-w-[82%]"
                />
              </>
            ) : (
              // Sin transición en curso: los 36 frames del set activo viven
              // APILADOS en el DOM y girar solo alterna cuál es visible —
              // swapear el src de un único <img> obligaba al navegador a
              // re-decodificar la imagen en cada frame, y ese lag hacía que
              // el 360 se sintiera pegado y luego saltara varios frames de
              // golpe al ponerse al día.
              <div className="pointer-events-none relative h-[90%] max-w-[100%] drop-shadow-2xl lg:h-full lg:max-w-[82%]">
                {Array.from({ length: FRAME_COUNT }, (_, i) => i + 1).map((n) => (
                  // eslint-disable-next-line @next/next/no-img-element -- secuencia de frames servida directo, no encaja con next/image
                  <img
                    key={n}
                    src={activeSet.frameUrl(n)}
                    alt={n === frame ? "Vista del vehículo" : ""}
                    aria-hidden={n !== frame}
                    draggable={false}
                    className={cn(
                      // El frame 1 fluye normal y le da su tamaño al
                      // contenedor; el resto se apila encima ocupándolo por
                      // completo (todos los frames de un set comparten
                      // dimensiones).
                      n === 1
                        ? "h-full w-auto max-w-full object-contain"
                        : "absolute inset-0 h-full w-full object-contain",
                      n !== frame && "invisible"
                    )}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="h-16 w-16 animate-pulse rounded-full bg-white/40" aria-hidden />
          )}
          </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {showControls && !unavailable && (
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
                disabled={wipe !== null}
                aria-label="Girar a la izquierda"
                title="Girar a la izquierda"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#12141A] shadow-md backdrop-blur transition-all hover:scale-105 hover:bg-[#111318] hover:text-white focus-visible:bg-[#111318] focus-visible:text-white focus-visible:outline-none disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-white/90 disabled:hover:text-[#12141A]"
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
                disabled={wipe !== null}
                aria-label="Girar a la derecha"
                title="Girar a la derecha"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#12141A] shadow-md backdrop-blur transition-all hover:scale-105 hover:bg-[#111318] hover:text-white focus-visible:bg-[#111318] focus-visible:text-white focus-visible:outline-none disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-white/90 disabled:hover:text-[#12141A]"
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
