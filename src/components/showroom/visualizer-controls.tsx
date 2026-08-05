"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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

// Botones de escena como muestras de degradado sólido (fiel al Figma) — la
// foto real de la escena solo se aplica al fondo del visualizador, nunca al
// botón: Claro es un degradado blanco y Oscuro un degradado negro.
const SCENE_SWATCHES: Record<string, string> = {
  light: "linear-gradient(135deg, #FFFFFF 0%, #D9DEE6 100%)",
  dark: "linear-gradient(135deg, #3A3E47 0%, #0C0D11 100%)",
};

/**
 * Barra inferior del visualizador — recursos/diseño-ux/Home-2.0.0-*.png.
 * En modo Interior, color/escena quedan DESHABILITADOS (no ocultos) — ver
 * docs/APP-FLOW.md §3.5.
 *
 * Selector de color estático (fiel al Figma): cada color del vehículo se
 * muestra UNA sola vez, en orden fijo — sin carrusel, sin copias y SIN
 * reordenar al seleccionar (las muestras nunca cambian de posición). Las
 * muestras inactivas se ven más chicas y con opacidad mínima, sin fondo
 * propio; la activa hace un pop con keyframes de rebote explícitos (crece
 * de más, rebota, se asienta) y queda a mayor escala que las demás.
 *
 * En mobile/tablet (<lg, no negociable) el orden visual cambia — Escena
 * primero, después Cambiar vehículo (ancho completo), Exterior/Interior
 * (ancho completo, 50/50) y por último los colores — pero se resuelve solo
 * con `order-*` responsive sobre los mismos 5 hijos, SIN mover nada en el
 * árbol JSX.
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
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);

  // Solo escenas de imagen (Claro/Oscuro) — las de color sólido ya no
  // existen como opción (se retiró el botón de color personalizado).
  const imageScenes = scenes.filter((s) => !s.color);

  // Las muestras de color mantienen SIEMPRE su posición (orden fijo del
  // vehículo, sin reordenar ni desplazar): al seleccionar, solo la muestra
  // activa aumenta su escala.

  return (
    <div className="flex w-full flex-col gap-4 rounded-[50px] bg-white p-4 shadow-lg lg:flex-row lg:items-center lg:gap-4 lg:py-2 lg:px-6">
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
        className={cn(
          "order-5 flex min-w-0 flex-1 items-center justify-center gap-3 py-2 lg:order-4",
          disabled && "pointer-events-none opacity-40"
        )}
        aria-disabled={disabled}
      >
        {vehicle.variants.map((variant) => {
          const isActive = variant.id === activeVariantId;
          return (
            <button
              key={variant.id}
              type="button"
              disabled={disabled}
              onClick={() => onVariantChange(variant.id)}
              title={variant.colorName}
              className={cn(
                "relative flex h-12 w-20 shrink-0 items-center justify-center",
                // La activa por encima: su imagen escalada desborda el botón
                // (zoom por transform, sin tocar el tamaño del botón).
                isActive ? "z-20" : "z-10"
              )}
            >
              <motion.img
                src={variant.thumbnailUrl}
                alt={variant.colorName}
                draggable={false}
                animate={
                  isActive
                    ? { scale: [1.1, 2.0, 1.7, 1.85, 1.8], opacity: 1 }
                    : { scale: 1.1, opacity: 0.35 }
                }
                transition={
                  isActive
                    ? { duration: 0.55, times: [0, 0.3, 0.55, 0.8, 1], ease: "easeOut" }
                    : { duration: 0.25, ease: "easeOut" }
                }
                whileHover={isActive ? undefined : { opacity: 0.7 }}
                className="h-full w-full object-contain"
              />
            </button>
          );
        })}
      </div>

      {/* Mismo separador (grosor h-8/w-px) que el de antes de Exterior/
          Interior — solo cambian los `order-*` para caer antes de Escena. */}
      <div className="order-6 hidden h-8 w-px bg-black/10 lg:order-5 lg:block" />

      <div
        className={cn(
          "order-1 flex flex-col items-center gap-2 lg:order-5 lg:flex-row",
          disabled && "pointer-events-none opacity-40"
        )}
        aria-disabled={disabled}
      >
        <span className="text-xs font-semibold tracking-wide text-[#6B7280]">Escena</span>
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
                  "h-7 w-7 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111318] focus-visible:ring-offset-2",
                  scene.id === activeSceneId ? "scale-110 border-[#111318]" : "border-black/10"
                )}
                style={{ background: SCENE_SWATCHES[scene.id] ?? scene.color ?? "#EEF0F3" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
