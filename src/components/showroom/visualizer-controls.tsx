"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
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

// Botones de escena como muestras de color sólido (fiel al Figma) — la foto
// real de la escena solo se aplica al fondo del visualizador, nunca al
// botón: Claro es blanco sólido y Oscuro es negro sólido.
const SCENE_SWATCHES: Record<string, string> = {
  light: "#FFFFFF",
  dark: "#111318",
};

// Azul oscuro del borde/check de la escena activa (mismo tono en mobile y
// desktop).
const ACTIVE_SCENE_BLUE = "#1E3A8A";

// El loop nativo de Embla solo funciona si el contenido "de respaldo" (todas
// las copias salvo la que hace de punto de envoltura) alcanza a cubrir el
// viewport — con pocos colores Embla desactiva el loop en silencio. Se repite
// el set las veces necesarias para garantizar ese margen (mismo criterio que
// el carrusel de vehículos en CatalogPanel).
const MIN_LOOP_SLIDES = 10;

/**
 * Barra inferior del visualizador — recursos/diseño-ux/Home-2.0.0-*.png.
 * En modo Interior, color/escena quedan DESHABILITADOS (no ocultos) — ver
 * docs/APP-FLOW.md §3.5.
 *
 * Selector de color en DESKTOP (≥lg) estático (fiel al Figma): cada color
 * del vehículo se muestra UNA sola vez, en orden fijo — sin carrusel, sin
 * copias y SIN reordenar al seleccionar (las muestras nunca cambian de
 * posición). Las muestras inactivas se ven más chicas y con opacidad mínima,
 * sin fondo propio; la activa hace un pop con keyframes de rebote explícitos
 * (crece de más, rebota, se asienta) y queda a mayor escala que las demás.
 *
 * Selector de color en MOBILE/TABLET (<lg, fiel al Figma mobile): carrusel
 * Embla full-bleed (rompe el ancho del panel hasta los bordes de la
 * PANTALLA) con align center — el color activo queda centrado y con gran
 * zoom, y los vecinos apenas asoman recortados por los bordes; se desliza
 * con el dedo y al asentarse el snap centrado pasa a ser el color activo
 * (también se puede tocar una miniatura lateral para centrarla).
 *
 * En mobile/tablet el orden visual además cambia — Escena primero, después
 * Cambiar vehículo (ancho completo), Exterior/Interior (ancho completo,
 * 50/50) y por último los colores — resuelto con `order-*` responsive; el
 * carrusel mobile y la fila desktop son dos hijos hermanos con el mismo
 * `order`, visibles uno por breakpoint (lg:hidden / hidden lg:flex).
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

  // ——— Carrusel de colores mobile (<lg) ———
  // Infinito (loop): así el color seleccionado siempre puede quedar
  // centrado, incluso siendo el primero o el último de la lista — sin loop
  // esos extremos se quedaban sin vecino de un lado y no centraban bien.
  const variantsCount = vehicle.variants.length;
  const activeVariantIndex = Math.max(0, vehicle.variants.findIndex((v) => v.id === activeVariantId));
  const colorRepeatCount = variantsCount === 0 ? 0 : Math.max(2, Math.ceil(MIN_LOOP_SLIDES / variantsCount));
  const loopVariants = Array.from({ length: colorRepeatCount }, () => vehicle.variants).flat();

  // startIndex capturado UNA sola vez (al montar): si se recalculara con
  // cada selección, embla detectaría el cambio de opciones y se
  // reinicializaría en cada tap de color — cortando en seco la animación de
  // scroll con un salto instantáneo (mismo criterio que CatalogPanel).
  const [initialVariantIndex] = useState(activeVariantIndex);
  const [colorEmblaRef, colorEmblaApi] = useEmblaCarousel({
    loop: true,
    align: "center",
    startIndex: initialVariantIndex,
  });
  // Índice del slide centrado (dentro de loopVariants) — manda sobre el
  // zoom de la miniatura.
  const [centeredVariantIndex, setCenteredVariantIndex] = useState(initialVariantIndex);

  useEffect(() => {
    if (!colorEmblaApi) return;
    // Snap centrado = color activo: al soltar el dedo (o al tocar una
    // miniatura lateral) el color del vehículo cambia al del centro. El
    // índice de Embla cae dentro de loopVariants — se vuelve a la variante
    // real con el módulo del largo original.
    const onSelect = () => {
      const idx = colorEmblaApi.selectedScrollSnap();
      setCenteredVariantIndex(idx);
      const centered = vehicle.variants[idx % variantsCount];
      if (centered && centered.id !== activeVariantId) onVariantChange(centered.id);
    };
    // Cambio de vehículo = otro set de variantes (watchSlides reinicializa):
    // salto instantáneo al color activo del vehículo nuevo, sin animación.
    const onReInit = () => {
      const idx = Math.max(0, vehicle.variants.findIndex((v) => v.id === activeVariantId));
      colorEmblaApi.scrollTo(idx, true);
      setCenteredVariantIndex(idx);
    };
    colorEmblaApi.on("select", onSelect);
    colorEmblaApi.on("reInit", onReInit);
    return () => {
      colorEmblaApi.off("select", onSelect);
      colorEmblaApi.off("reInit", onReInit);
    };
  }, [colorEmblaApi, vehicle, activeVariantId, variantsCount, onVariantChange]);

  // Cambio de variante desde afuera (p. ej. selector desktop tras un resize):
  // el carrusel se re-centra en el color activo, en la copia más cercana a
  // donde esté parado (con loop, saltar siempre a la primera copia daría un
  // recorrido más largo de lo necesario).
  useEffect(() => {
    if (!colorEmblaApi || variantsCount === 0) return;
    const current = colorEmblaApi.selectedScrollSnap();
    if (current % variantsCount === activeVariantIndex) return;
    const nearestIndex = Math.floor(current / variantsCount) * variantsCount + activeVariantIndex;
    colorEmblaApi.scrollTo(nearestIndex);
  }, [colorEmblaApi, activeVariantIndex, variantsCount]);

  // Las muestras de color mantienen SIEMPRE su posición (orden fijo del
  // vehículo, sin reordenar ni desplazar): al seleccionar, solo la muestra
  // activa aumenta su escala.

  return (
    <div className="flex w-full flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-4 lg:rounded-[50px] lg:bg-white lg:py-2 lg:px-6 lg:shadow-lg">
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

      {/* Carrusel de colores MOBILE — full-bleed: w-screen + margen negativo
          para romper el padding del panel y de la página (el contenedor
          padre está centrado en el viewport, así que 50% - 50vw cae justo en
          el borde izquierdo de la pantalla). Los vecinos quedan recortados
          por los bordes — apenas asoman, como en el Figma. */}
      <div
        className={cn(
          "order-5 ml-[calc(50%-50vw)] w-screen lg:hidden",
          disabled && "pointer-events-none opacity-40"
        )}
        aria-disabled={disabled}
      >
        <div ref={colorEmblaRef} className="cursor-grab overflow-hidden active:cursor-grabbing">
          <div className="flex items-center py-6">
            {loopVariants.map((variant, i) => {
              const isCentered = i === centeredVariantIndex;
              return (
                <div
                  key={`${variant.id}-${i}`}
                  className="flex min-w-0 shrink-0 grow-0 basis-[42vw] items-center justify-center sm:basis-[230px]"
                >
                  <motion.img
                    src={variant.thumbnailUrl}
                    alt={variant.colorName}
                    title={variant.colorName}
                    draggable={false}
                    onClick={() => colorEmblaApi?.scrollTo(i)}
                    animate={{ scale: isCentered ? 1.45 : 0.6 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    // max-w-none: el zoom del centro puede desbordar su slide
                    // (los vecinos se solapan visualmente, fiel al mockup).
                    className="h-24 w-auto max-w-none object-contain sm:h-28"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "order-5 hidden min-w-0 flex-1 items-center justify-center gap-3 py-2 lg:order-4 lg:flex",
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
                  // 25% más grande en mobile/tablet (35px vs 28px); en
                  // desktop conserva el tamaño original. El borde SIEMPRE
                  // mide 2px (solo cambia de color al activarse) para que la
                  // escena activa no crezca respecto a la inactiva.
                  "relative h-[35px] w-[35px] rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111318] focus-visible:ring-offset-2 lg:h-7 lg:w-7",
                  scene.id === activeSceneId ? "scale-110" : "border-black/10"
                )}
                style={{
                  background: SCENE_SWATCHES[scene.id] ?? scene.color ?? "#EEF0F3",
                  borderColor: scene.id === activeSceneId ? ACTIVE_SCENE_BLUE : undefined,
                }}
              >
                {scene.id === activeSceneId && (
                  <span
                    aria-hidden
                    className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white"
                    style={{ background: ACTIVE_SCENE_BLUE }}
                  >
                    <svg viewBox="0 0 12 12" className="h-2 w-2" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.5L5 9L9.5 3.5" />
                    </svg>
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
