"use client";

import { useState } from "react";
import type { PointOfInterest, ViewMode } from "@/lib/types";
import { iconAssetUrl } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface PointsOfInterestProps {
  points: PointOfInterest[];
  mode: ViewMode;
}

/**
 * Toolbar de "puntos de interés" — hotspots configurables por vehículo y
 * por modo (docs/TRD.md §4.6). Contenido genérico como placeholder hasta
 * tener el contenido real por vehículo. Vive agrupado con
 * VisualizerControls (showroom-app.tsx), no posicionado absoluto por su
 * cuenta — fluye normal dentro de ese contenedor.
 */
export function PointsOfInterest({ points, mode }: PointsOfInterestProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const filtered = points.filter((p) => p.mode === mode).sort((a, b) => a.order - b.order);
  const active = filtered.find((p) => p.id === openId);

  return (
    <div className="flex flex-row gap-3">
      {filtered.map((poi) => (
        <div key={poi.id} className="relative">
          <button
            type="button"
            aria-label={poi.title}
            title={poi.title}
            onClick={() => setOpenId((cur) => (cur === poi.id ? null : poi.id))}
            className={cn(
              "flex h-13 w-13 items-center justify-center rounded-full bg-white/85 text-[#12141A] shadow-sm backdrop-blur transition-transform hover:scale-105",
              openId === poi.id && "ring-2 ring-[#111318]"
            )}
          >
            {/* Ícono grande respecto al círculo (≈70%), fiel al Figma — solo
                queda un anillo fino de aire alrededor. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- ícono SVG suelto de recursos/Iconos */}
            <img src={iconAssetUrl(poi.icon)} alt="" aria-hidden className="h-10 w-10" />
          </button>
          {active?.id === poi.id && (
            <div
              role="tooltip"
              className="absolute bottom-12 left-0 w-56 rounded-xl bg-white p-3 pr-8 text-left shadow-lg"
            >
              <button
                type="button"
                aria-label="Cerrar"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenId(null);
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
