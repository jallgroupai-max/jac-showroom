"use client";

import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import { X } from "lucide-react";
import type { Category, Vehicle } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CatalogPanelProps {
  categories: Category[];
  activeCategorySlug: string;
  onCategoryChange: (slug: string) => void;
  vehicles: Vehicle[];
  activeVehicleSlug: string;
  onSelectVehicle: (slug: string) => void;
  onClose: () => void;
}

// El loop nativo de Embla solo funciona si el contenido "de respaldo" (todas
// las tarjetas salvo la que hace de punto de envoltura) alcanza a cubrir el
// viewport — con pocas tarjetas angostas eso no se cumple y Embla desactiva
// el loop en silencio, congelando el auto-scroll al llegar al final. Se
// repite el set las veces necesarias para garantizar ese margen (mismo
// patrón que usan los demos oficiales de "marquee" de Embla).
const MIN_LOOP_SLIDES = 8;

/**
 * "Selecciona tu vehículo" — ver recursos/diseño-ux/Home-1.0.0-*.png.
 * Carrusel infinito con Embla Carousel (`embla-carousel-react` +
 * `embla-carousel-auto-scroll`) — desplazamiento continuo a velocidad
 * constante, sin saltos, en loop real, sin controles manuales (sin flechas).
 * Se pausa con hover/foco. El autoplay no selecciona ni abre ningún
 * vehículo — el resaltado azul (#5D95B7, muestreado del mockup) y la
 * apertura del visualizador solo ocurren al hacer clic directamente sobre
 * una tarjeta.
 */
export function CatalogPanel({
  categories,
  activeCategorySlug,
  onCategoryChange,
  vehicles,
  activeVehicleSlug,
  onSelectVehicle,
  onClose,
}: CatalogPanelProps) {
  const [emblaRef] = useEmblaCarousel(
    { loop: true, dragFree: true, align: "start", startIndex: 0, skipSnaps: true },
    [AutoScroll({ speed: 0.7, startDelay: 0, stopOnInteraction: false, stopOnMouseEnter: true, stopOnFocusIn: true })]
  );

  const repeatCount = vehicles.length > 1 ? Math.max(2, Math.ceil(MIN_LOOP_SLIDES / vehicles.length)) : 1;
  const loopVehicles = Array.from({ length: repeatCount }, () => vehicles).flat();

  return (
    <div className="relative flex h-full flex-col items-center gap-5 overflow-hidden px-4 pb-4 pt-5 sm:pt-6">
      <button
        type="button"
        onClick={onClose}
        aria-label="Ocultar selector de vehículos"
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#6B7280] shadow-sm transition-colors hover:bg-[#F4F6F9] hover:text-[#12141A] sm:right-4 sm:top-4"
      >
        <X className="h-4 w-4" />
      </button>

      <h2 className="text-xl font-extrabold text-[#12141A] sm:text-2xl">Selecciona tu vehículo</h2>

      <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm">
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => onCategoryChange(c.slug)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors sm:px-5",
              c.slug === activeCategorySlug ? "bg-[#111318] text-white" : "text-[#6B7280] hover:text-[#12141A]"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {vehicles.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#6B7280]">
          Próximamente en esta categoría.
        </div>
      ) : (
        <div className="relative w-full flex-1">
          <div className="h-full w-full overflow-hidden" ref={emblaRef}>
            <div className="flex h-full gap-3 px-[10%]">
              {loopVehicles.map((v, i) => {
                const isActive = v.slug === activeVehicleSlug;
                return (
                  <button
                    key={`${v.slug}-${i}`}
                    type="button"
                    onClick={() => onSelectVehicle(v.slug)}
                    className={cn(
                      "relative flex w-[190px] shrink-0 flex-col justify-between overflow-hidden rounded-2xl p-4 text-left transition-colors sm:w-[220px]",
                      isActive ? "bg-[#5D95B7] text-white" : "bg-[#FBFBFB] text-[#12141A]"
                    )}
                  >
                    <div>
                      <p className="text-base font-bold leading-tight">{v.commercialName}</p>
                      <p className={cn("text-xs", isActive ? "text-white/80" : "text-[#6B7280]")}>{v.typeTag}</p>
                    </div>
                    <div className="mt-2 flex items-end justify-between">
                      <div className="flex gap-1">
                        {v.featureIcons.slice(0, 2).map((icon) => (
                          <span
                            key={icon}
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-full text-[10px]",
                              isActive ? "bg-white/25" : "bg-[#EEF0F3]"
                            )}
                            aria-hidden
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- ícono SVG suelto de recursos/Iconos */}
                            <img src={`/assets/icons/${icon}.svg`} alt="" className="h-4 w-4" />
                          </span>
                        ))}
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail placeholder de sprite */}
                      <img src={v.variants[0].thumbnailUrl} alt={v.commercialName} className="h-16 w-auto object-contain" draggable={false} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
