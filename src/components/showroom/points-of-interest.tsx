"use client";

import { motion } from "framer-motion";
import type { PointOfInterest, ViewMode } from "@/lib/types";
import { iconAssetUrl } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface PointsOfInterestProps {
  points: PointOfInterest[];
  mode: ViewMode;
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
  /** true en exterior: el detalle grande lo muestra PoiDetailPanel junto al
   * vehículo (showroom-app.tsx), así que este componente NO dibuja su propio
   * tooltip flotante — solo los botones + el efecto de gota de agua. */
  hideInlineDetail?: boolean;
  /** Intensidad del anillo por dispositivo (pedido explícito, dos rondas
   * distintas): en mobile se veía DEMASIADO marcado — gris claro y
   * opacidad baja; en desktop casi no se notaba — gris oscuro y opacidad
   * alta. No hay forma de variar esto solo con clases responsive porque
   * `animate` de framer-motion es JS, no CSS. */
  isDesktop: boolean;
}

// Un solo anillo, sutil — reducido a pedido (dos anillos se sentía muy
// cargado). La opacidad arranca y termina en 0 (keyframes, no un simple
// 0.7->0) para que el reinicio del loop ocurra con el anillo YA invisible:
// así no hay parpadeo/salto al recomenzar cada ciclo.
const RIPPLE_DURATION = 2.2;
const RIPPLE_MOBILE = { color: "#D1D5DB", peakOpacity: 0.45, maxScale: 1.5 };
// Blanco y más sutil — el negro de antes se veía "muy negro" (pedido
// explícito de bajarlo); menos crecimiento (1.3 en vez de 1.5) para que se
// sienta más chico/discreto.
const RIPPLE_DESKTOP = { color: "#FFFFFF", peakOpacity: 0.55, maxScale: 1.3 };

/**
 * Toolbar de "puntos de interés" — hotspots configurables por vehículo y
 * por modo (docs/TRD.md §4.6). Contenido genérico como placeholder hasta
 * tener el contenido real por vehículo. Vive agrupado con
 * VisualizerControls (showroom-app.tsx), no posicionado absoluto por su
 * cuenta — fluye normal dentro de ese contenedor. Selección controlada
 * desde ShowroomApp: en exterior, abrir un punto de interés también rota el
 * vehículo y corre el panel grande de detalle (ver PoiDetailPanel).
 */
export function PointsOfInterest({ points, mode, activeId, onActiveChange, hideInlineDetail, isDesktop }: PointsOfInterestProps) {
  const filtered = points.filter((p) => p.mode === mode).sort((a, b) => a.order - b.order);
  const active = filtered.find((p) => p.id === activeId);
  const ripple = isDesktop ? RIPPLE_DESKTOP : RIPPLE_MOBILE;

  return (
    <div className="flex flex-row gap-3">
      {filtered.map((poi) => (
        <div key={poi.id} className="relative">
          {/* Efecto "gota de agua": un anillo que nace del tamaño del botón y
              se aleja agrandándose mientras se desvanece, en loop. Color y
              opacidad de pico DISTINTOS por dispositivo — ver RIPPLE_MOBILE
              / RIPPLE_DESKTOP arriba. Van detrás del botón (antes en el DOM,
              sin z-index) para no tapar el ícono. */}
          <div className="pointer-events-none absolute inset-0 rounded-full" aria-hidden>
            <motion.span
              className="absolute inset-0 rounded-full border-2"
              style={{ borderColor: ripple.color }}
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: [1, ripple.maxScale], opacity: [0, ripple.peakOpacity, 0] }}
              transition={{ duration: RIPPLE_DURATION, repeat: Infinity, ease: "easeOut" }}
            />
          </div>
          <button
            type="button"
            aria-label={poi.title}
            title={poi.title}
            onClick={() => onActiveChange(activeId === poi.id ? null : poi.id)}
            className={cn(
              "flex h-13 w-13 items-center justify-center rounded-full bg-white/85 text-[#12141A] shadow-sm backdrop-blur transition-transform hover:scale-105",
              activeId === poi.id && "ring-2 ring-[#111318]"
            )}
          >
            {/* Ícono grande respecto al círculo (≈70%), fiel al Figma — solo
                queda un anillo fino de aire alrededor. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- ícono SVG suelto de recursos/Iconos */}
            <img src={iconAssetUrl(poi.icon)} alt="" aria-hidden className="h-10 w-10" />
          </button>
          {!hideInlineDetail && active?.id === poi.id && (
            <div
              role="tooltip"
              className="absolute bottom-12 left-0 w-56 rounded-xl bg-white p-3 pr-8 text-left shadow-lg"
            >
              <button
                type="button"
                aria-label="Cerrar"
                onClick={(e) => {
                  e.stopPropagation();
                  onActiveChange(null);
                }}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-[#F4F6F9] hover:text-[#12141A]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              <p className="text-sm font-bold text-[#12141A]">{active.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">{active.description}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
