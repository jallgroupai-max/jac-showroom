"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Palette, X } from "lucide-react";
import type { Scene, Vehicle, ViewMode } from "@/lib/types";
import { cn } from "@/lib/utils";

interface VisualizerControlsProps {
  vehicle: Vehicle;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  activeVariantId: string;
  onVariantChange: (variantId: string) => void;
  scenes: Scene[];
  activeSceneId: Scene["id"];
  onSceneChange: (sceneId: Scene["id"]) => void;
  onChangeVehicle: () => void;
}

const SWATCH_WIDTH = 64; // w-16

/**
 * Barra inferior del visualizador — recursos/diseño-ux/Home-2.0.0-*.png.
 * En modo Interior, color/escena quedan DESHABILITADOS (no ocultos) — ver
 * docs/APP-FLOW.md §3.5.
 *
 * Selector de color tipo "ruleta": la muestra activa SIEMPRE queda en el
 * centro del carril. El padding lateral que hace eso posible se calcula en
 * JS (px fijos vía ResizeObserver), NO con un `calc(50%...)` en CSS —ese
 * porcentaje, dentro del `motion.div` animado que envuelve esta barra,
 * llegó a desincronizar la medición de layout de Framer Motion e hizo que
 * aplicara una corrección (transform) a un ancestro no relacionado (el
 * header). El indicador de fondo se mide en vivo (offsetLeft/offsetWidth de
 * la muestra activa) y se anima con `animate` puro — tampoco usa
 * `layoutId`, mismo motivo. Las muestras inactivas se ven notoriamente más
 * chicas (60% del tamaño) que la activa, a propósito, para que el "pop" se
 * note; al activarse, la muestra hace ese pop con keyframes de rebote
 * explícitos (crece de más, rebota, se asienta) — similar al `bounceOut` de
 * animate.css pero resuelto con Framer Motion (ya es la librería de
 * animación del proyecto).
 *
 * El carril triplica el set de colores (como el carrusel de vehículos del
 * catálogo) y SOLO la copia del medio puede quedar activa/centrada — así,
 * sin importar si el color elegido es el primero o el último del vehículo,
 * siempre hay opciones reales de vecino a izquierda y derecha (de la copia
 * anterior/siguiente). Sin esto, elegir el primer o último color lo dejaba
 * "pegado" a un borde porque no había nada antes/después para mostrar.
 *
 * En mobile/tablet (<lg, no negociable) el orden visual cambia — Escena
 * primero, después Cambiar vehículo (ancho completo), Exterior/Interior
 * (ancho completo, 50/50) y por último los colores — pero se resuelve solo
 * con `order-*` responsive sobre los mismos 5 hijos, SIN mover nada en el
 * árbol JSX, para no arriesgar la lógica de medición/centrado de arriba.
 */
export function VisualizerControls({
  vehicle,
  viewMode,
  onViewModeChange,
  activeVariantId,
  onVariantChange,
  scenes,
  activeSceneId,
  onSceneChange,
  onChangeVehicle,
}: VisualizerControlsProps) {
  const disabled = viewMode === "interior";
  const stripRef = useRef<HTMLDivElement>(null);
  const activeSwatchRef = useRef<HTMLButtonElement>(null);
  const [pillRect, setPillRect] = useState<{ left: number; width: number } | null>(null);
  const [sidePadding, setSidePadding] = useState(0);
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const [colorPanelOpen, setColorPanelOpen] = useState(false);

  // Escenas "foto" (light/dark) se muestran sueltas como siempre; las de
  // color sólido se agrupan en un único botón que abre un panel selector
  // (mismo patrón que los tooltips de PointsOfInterest) — así no saturan la
  // fila de ESCENA con 5+ círculos sueltos.
  const imageScenes = scenes.filter((s) => !s.color);
  const colorScenes = scenes.filter((s) => s.color);
  const activeColorScene = colorScenes.find((s) => s.id === activeSceneId);

  // Con 2+ colores, triplicamos para que la copia del medio (la única que
  // puede quedar "activa") siempre tenga vecinos reales a ambos lados, sin
  // importar si el color elegido es el primero o el último del vehículo.
  const canLoop = vehicle.variants.length > 1;
  const loopVariants = canLoop ? [...vehicle.variants, ...vehicle.variants, ...vehicle.variants] : vehicle.variants;
  const middleStart = canLoop ? vehicle.variants.length : 0;
  const middleEnd = middleStart + vehicle.variants.length;

  // Padding lateral en px (no `%`/`calc()`) para que hasta la primera o
  // última muestra pueda desplazarse hasta el centro del carril.
  // `useLayoutEffect` (no `useEffect`) a propósito: si el padding se mide
  // en un efecto normal, el centrado de abajo (que sí es `useEffect`) podía
  // correr ANTES de que el padding correcto llegara al DOM — dos
  // `scrollIntoView` seguidos, uno con el padding viejo (mal) y otro con el
  // nuevo, se veían como un tirón de ida y vuelta. `useLayoutEffect` mide y
  // aplica el padding correcto de forma síncrona, antes de que el navegador
  // pinte y antes de que corra cualquier `useEffect`, así el centrado de
  // abajo siempre ve el layout ya correcto y solo llama a `scrollIntoView`
  // una vez.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const update = () => setSidePadding(Math.max(0, strip.clientWidth / 2 - SWATCH_WIDTH / 2));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const swatch = activeSwatchRef.current;
    if (!swatch) return;
    setPillRect({ left: swatch.offsetLeft, width: swatch.offsetWidth });
    swatch.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeVariantId, vehicle.slug, sidePadding]);

  return (
    <div className="flex w-full flex-col gap-4 rounded-3xl bg-white p-4 shadow-lg lg:flex-row lg:items-center lg:gap-4 lg:p-2">
      <button
        type="button"
        onClick={onChangeVehicle}
        className="order-2 flex w-full items-center justify-center gap-2 rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold text-[#12141A] transition-colors hover:bg-[#F4F6F9] lg:order-1 lg:w-auto"
      >
        <span aria-hidden>⇄</span> Cambiar vehículo
      </button>

      <div className="order-3 hidden h-8 w-px bg-black/10 lg:order-2 lg:block" />

      <div className="order-4 flex w-full items-center gap-1 rounded-full bg-[#F4F6F9] p-1 lg:order-3 lg:w-auto">
        {(["exterior", "interior"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewModeChange(mode)}
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold capitalize transition-colors lg:flex-none",
              viewMode === mode ? "bg-[#111318] text-white" : "text-[#6B7280]"
            )}
          >
            {mode === "exterior" ? "Exterior" : "Interior"}
          </button>
        ))}
      </div>

      <div
        ref={stripRef}
        className={cn(
          "scrollbar-none relative order-5 flex min-w-0 flex-1 items-center gap-3 overflow-x-auto py-2 lg:order-4",
          disabled && "pointer-events-none opacity-40"
        )}
        style={{ paddingLeft: sidePadding, paddingRight: sidePadding }}
        aria-disabled={disabled}
      >
        {pillRect && (
          <motion.span
            className="pointer-events-none absolute top-1/2 h-12 -translate-y-1/2 rounded-full bg-[#F4F6F9]"
            animate={{ x: pillRect.left, width: pillRect.width }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          />
        )}
        {loopVariants.map((variant, i) => {
          const isMiddleCopy = i >= middleStart && i < middleEnd;
          const isActive = isMiddleCopy && variant.id === activeVariantId;
          return (
            <button
              key={`${variant.id}-${i}`}
              ref={isActive ? activeSwatchRef : undefined}
              type="button"
              disabled={disabled}
              onClick={() => onVariantChange(variant.id)}
              title={variant.colorName}
              className={cn(
                "relative z-10 flex h-12 w-16 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                !isActive && "bg-[#EEF0F3]"
              )}
            >
              <motion.img
                src={variant.thumbnailUrl}
                alt={variant.colorName}
                draggable={false}
                animate={{ scale: isActive ? [0.6, 1.22, 0.94, 1.06, 1] : 0.6 }}
                transition={
                  isActive
                    ? { duration: 0.55, times: [0, 0.3, 0.55, 0.8, 1], ease: "easeOut" }
                    : { duration: 0.25, ease: "easeOut" }
                }
                className={cn(
                  "h-full w-full object-contain transition-[filter,opacity] duration-300 ease-out",
                  !isActive && "opacity-70 grayscale hover:opacity-100 hover:grayscale-0"
                )}
              />
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "order-1 flex flex-col items-center gap-2 lg:order-5 lg:flex-row",
          disabled && "pointer-events-none opacity-40"
        )}
        aria-disabled={disabled}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">Escena</span>
        <div className="flex items-center gap-2">
          {imageScenes.map((scene) => (
            <div key={scene.id} className="relative">
              <AnimatePresence>
                {hoveredSceneId === scene.id && (
                  <motion.span
                    role="tooltip"
                    initial={{ opacity: 0, y: 4, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.9 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#111318] px-2 py-1 text-xs font-medium text-white shadow-lg"
                  >
                    {scene.label}
                    <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#111318]" />
                  </motion.span>
                )}
              </AnimatePresence>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSceneChange(scene.id)}
                onMouseEnter={() => setHoveredSceneId(scene.id)}
                onMouseLeave={() => setHoveredSceneId(null)}
                onFocus={() => setHoveredSceneId(scene.id)}
                onBlur={() => setHoveredSceneId(null)}
                aria-label={scene.label}
                className={cn(
                  "h-7 w-7 rounded-full border-2 bg-cover bg-center transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111318] focus-visible:ring-offset-2",
                  scene.id === activeSceneId ? "scale-110 border-[#111318]" : "border-black/10"
                )}
                style={
                  scene.color
                    ? { backgroundColor: scene.color }
                    : { backgroundImage: `url(${scene.imageUrl ?? vehicle.ownBackgroundUrl})` }
                }
              />
            </div>
          ))}

          {colorScenes.length > 0 && (
            <div className="relative">
              <AnimatePresence>
                {hoveredSceneId === "color-group" && !colorPanelOpen && (
                  <motion.span
                    role="tooltip"
                    initial={{ opacity: 0, y: 4, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.9 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#111318] px-2 py-1 text-xs font-medium text-white shadow-lg"
                  >
                    Color de fondo
                    <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#111318]" />
                  </motion.span>
                )}
              </AnimatePresence>

              <button
                type="button"
                disabled={disabled}
                onClick={() => setColorPanelOpen((open) => !open)}
                onMouseEnter={() => setHoveredSceneId("color-group")}
                onMouseLeave={() => setHoveredSceneId(null)}
                onFocus={() => setHoveredSceneId("color-group")}
                onBlur={() => setHoveredSceneId(null)}
                aria-label="Color de fondo"
                aria-expanded={colorPanelOpen}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111318] focus-visible:ring-offset-2",
                  !activeColorScene && "bg-[#EEF0F3]",
                  colorPanelOpen || activeColorScene ? "scale-110 border-[#111318]" : "border-black/10"
                )}
                style={activeColorScene ? { backgroundColor: activeColorScene.color } : undefined}
              >
                {!activeColorScene && <Palette className="h-3.5 w-3.5 text-[#6B7280]" />}
              </button>

              <AnimatePresence>
                {colorPanelOpen && (
                  <motion.div
                    role="dialog"
                    aria-label="Selector de color de fondo"
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute bottom-full right-0 z-20 mb-2 w-56 rounded-xl bg-white p-3 pr-8 text-left shadow-lg"
                  >
                    <button
                      type="button"
                      aria-label="Cerrar"
                      onClick={() => setColorPanelOpen(false)}
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-[#F4F6F9] hover:text-[#12141A]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <p className="text-sm font-bold text-[#12141A]">Color de fondo</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {colorScenes.map((scene) => (
                        <button
                          key={scene.id}
                          type="button"
                          onClick={() => {
                            onSceneChange(scene.id);
                            setColorPanelOpen(false);
                          }}
                          title={scene.label}
                          aria-label={scene.label}
                          className={cn(
                            "h-8 w-8 shrink-0 rounded-full border-2 transition-transform hover:scale-105",
                            scene.id === activeSceneId ? "scale-110 border-[#111318]" : "border-black/10"
                          )}
                          style={{ backgroundColor: scene.color }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
