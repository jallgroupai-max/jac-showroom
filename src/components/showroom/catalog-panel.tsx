"use client";

import { useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { Category, Vehicle } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CatalogPanelProps {
  categories: Category[];
  activeCategorySlug: string;
  onCategoryChange: (slug: string) => void;
  vehicles: Vehicle[];
  activeVehicleSlug: string;
  /** Clic simple: cambia el vehículo previsualizado SIN cerrar el selector. */
  onSelectVehicle: (slug: string) => void;
  /** Doble clic sobre la tarjeta: confirma y cierra el selector. */
  onConfirmVehicle: () => void;
}

// El loop nativo de Embla solo funciona si el contenido "de respaldo" (todas
// las tarjetas salvo la que hace de punto de envoltura) alcanza a cubrir el
// viewport — con pocas tarjetas Embla desactiva el loop en silencio. Se
// repite el set las veces necesarias para garantizar ese margen.
const MIN_LOOP_SLIDES = 10;

// Selección en dos tiempos: al clic la previsualización del héroe cambia de
// inmediato, y tras esta pausa el carrusel se desplaza animado hasta centrar
// la tarjeta clicada — el resaltado azul viaja junto con el snap (ver
// centeredIndex), así el crossfade del héroe arranca antes que el scroll.
const HIGHLIGHT_FADE_MS = 300;

/**
 * "Selecciona tu vehículo" — ver recursos/diseño-ux/Home-1.0.0-*.png.
 * Carrusel Embla arrastrable con dedo o mouse, en scroll INFINITO (loop),
 * SIN desplazamiento automático ni flechas: solo se mueve cuando el usuario
 * lo arrastra. Abre con el vehículo seleccionado centrado (startIndex + align
 * center). El resaltado azul (#5D95B7, muestreado del mockup) es POSICIONAL:
 * solo la tarjeta CENTRADA lo lleva (el resto queda blanca) — con el loop el
 * set se repite y un resaltado por slug pintaría todas las copias a la vez.
 * La apertura del visualizador solo ocurre al hacer clic sobre una tarjeta —
 * Embla ya cancela el clic cuando el gesto fue un arrastre.
 */
export function CatalogPanel({
  categories,
  activeCategorySlug,
  onCategoryChange,
  vehicles,
  activeVehicleSlug,
  onSelectVehicle,
  onConfirmVehicle,
}: CatalogPanelProps) {
  const activeIndex = Math.max(0, vehicles.findIndex((v) => v.slug === activeVehicleSlug));
  const repeatCount = vehicles.length > 1 ? Math.max(2, Math.ceil(MIN_LOOP_SLIDES / vehicles.length)) : 1;
  const loopVehicles = Array.from({ length: repeatCount }, () => vehicles).flat();

  // startIndex capturado UNA sola vez (al montar): si se recalculara con cada
  // selección, embla se reinicializaría y la tarjeta nueva saltaría al centro
  // de golpe — el centrado posterior se hace con scrollTo animado (abajo).
  const [initialIndex] = useState(activeIndex);

  // Sin dragFree: al soltar, Embla ajusta al snap más cercano. Con loop, el
  // scrollTo de la selección toma el camino más corto hasta la copia clicada.
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "center",
    startIndex: initialIndex,
  });

  // Índice del slide CENTRADO (snap seleccionado de Embla) — es quien manda
  // sobre el resaltado azul: se actualiza al clicar (scrollTo), al arrastrar
  // y al reinicializar, siguiendo siempre a la tarjeta del medio.
  const [centeredIndex, setCenteredIndex] = useState(initialIndex);
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setCenteredIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  // Cambio de categoría = otro set de tarjetas: salto instantáneo al inicio
  // (es un cambio de contexto, no una selección — sin animación).
  const prevCategoryRef = useRef(activeCategorySlug);
  useEffect(() => {
    if (prevCategoryRef.current === activeCategorySlug) return;
    prevCategoryRef.current = activeCategorySlug;
    emblaApi?.scrollTo(0, true);
  }, [activeCategorySlug, emblaApi]);

  const scrollTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
    },
    []
  );

  // Clic en una tarjeta: la selección (resaltado + previsualización en el
  // héroe) es inmediata; el desplazamiento del carrusel espera a que el fade
  // del resaltado anterior termine y recién ahí centra la tarjeta clicada,
  // con la animación de scroll propia de Embla.
  function handleSelect(slug: string, index: number) {
    onSelectVehicle(slug);
    if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
      scrollTimerRef.current = null;
      emblaApi?.scrollTo(index);
    }, HIGHLIGHT_FADE_MS);
  }

  return (
    <div className="relative flex h-full flex-col items-center gap-5 overflow-hidden px-4 pb-4 pt-5 sm:pt-6 lg:px-0 lg:pt-30">
      {/* Encabezado: apilado y centrado en mobile; en desktop una sola fila
          del ancho del carrusel (1160px) con el título a la IZQUIERDA y las
          pestañas de categoría centradas, ambos a la misma altura. */}
      <div className="flex w-full flex-col items-center gap-5 lg:relative lg:mx-auto lg:w-[1160px] lg:max-w-full lg:flex-row lg:justify-center lg:gap-0">
        <h2 className="text-xl font-extrabold text-[#12141A] sm:text-2xl lg:absolute lg:left-3 lg:top-1/2 lg:-translate-y-1/2">
          Selecciona tu vehículo
        </h2>

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
      </div>

      {vehicles.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#6B7280]">
          Próximamente en esta categoría.
        </div>
      ) : (
        <div className="relative w-full flex-1">
          {/* En desktop el viewport del carrusel mide exactamente 5 slides
              (5 × 232px) centrado — nunca se ve una sexta tarjeta. */}
          <div
            className="h-full w-full cursor-grab overflow-hidden active:cursor-grabbing lg:mx-auto lg:w-[1160px] lg:max-w-full"
            ref={emblaRef}
          >
            <div className="flex h-full items-center gap-3 lg:gap-0">
              {loopVehicles.map((v, i) => {
                // Posicional, no por slug: solo la copia centrada se pinta.
                const isActive = i === centeredIndex;
                return (
                  // Slide: ancho fijo en mobile; en desktop 232px (tarjeta
                  // CUADRADA de 220 + 12 de separación interna).
                  <div
                    key={`${v.slug}-${i}`}
                    className="flex min-w-0 shrink-0 grow-0 basis-[190px] sm:basis-[220px] lg:basis-[232px] lg:px-1.5"
                  >
                  <button
                    type="button"
                    onClick={() => handleSelect(v.slug, i)}
                    // El primer clic del doble clic ya seleccionó este
                    // vehículo — el doble clic solo confirma y cierra.
                    onDoubleClick={onConfirmVehicle}
                    className={cn(
                      "relative flex h-[180px] w-full flex-col justify-between overflow-hidden rounded-2xl p-4 text-left transition-colors duration-300",
                      isActive ? "bg-[#5D95B7] text-white" : "bg-[#FBFBFB] text-[#12141A]"
                    )}
                  >
                    <div>
                      <p className="text-base font-bold leading-tight">{v.commercialName}</p>
                      <p className={cn("text-xs", isActive ? "text-white/80" : "text-[#6B7280]")}>{v.typeTag}</p>
                    </div>
                    {/* Vehículo grande recortado por el borde derecho de la
                        tarjeta (overflow-hidden): solo se ve ~la mitad, fiel
                        al Figma. `max-w-none` evita que el contenedor lo
                        encoja; el translate empuja la otra mitad fuera. Es
                        absoluto con altura FIJA — nada del contenido de la
                        tarjeta (chips incluidos) puede reducirlo. */}
                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail placeholder de sprite */}
                    <img
                      src={v.cardImageUrl ?? v.variants[0].thumbnailUrl}
                      alt={v.commercialName}
                      draggable={false}
                      className="pointer-events-none absolute bottom-1 right-0 h-32 w-auto max-w-none translate-x-[45%] object-contain sm:h-36"
                    />
                    {/* Tipos del vehículo (eléctrico/gasolina/gasoil/4x4,
                        combinables) flotando en la esquina inferior
                        izquierda, FUERA del flujo — no disputan espacio con
                        la imagen. Los SVG son el chip completo exportado de
                        Figma (lienzo 52x52 con círculo y sombra propios),
                        renderizados 1:1. */}
                    <div className="absolute bottom-2 left-2 z-10 flex">
                      {v.featureIcons.slice(0, 2).map((icon) => (
                        // eslint-disable-next-line @next/next/no-img-element -- ícono SVG suelto de recursos/Iconos
                        <img
                          key={icon}
                          src={`/assets/icons/${icon}.svg`}
                          alt=""
                          aria-hidden
                          className="h-13 w-13"
                        />
                      ))}
                    </div>
                  </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
