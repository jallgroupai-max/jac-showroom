"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
import type { Category, Vehicle } from "@/lib/types";
import { iconAssetUrl, isVehicleAvailable } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/** "Ingresar al vehículo": flecha apuntando hacia una puerta de vehículo
 * (la puerta a la derecha, con ventanilla y manija; la flecha entra desde
 * la izquierda). Trazo con currentColor. Inline (no /assets/icons) por ser
 * UI pura: sin red ni precarga que mantener. */
function EnterVehicleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Puerta (derecha): borde superior inclinado = marco de ventanilla. */}
      <path d="M13 19v-5.6a2 2 0 0 1 .6-1.4l4.4-4.4A2 2 0 0 1 19.4 7h.6a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1Z" />
      {/* Línea de la ventanilla y manija. */}
      <path d="M13 13.4h8" />
      <path d="M15.5 16.2h3" />
      {/* Flecha que apunta HACIA la puerta. */}
      <path d="M2.5 12h7.5" />
      <path d="m7 8.5 3.5 3.5L7 15.5" />
    </svg>
  );
}

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
  return (
    // Sin overflow-hidden en el root: el carrusel de abajo es full-bleed
    // (w-screen con margen negativo) y un overflow acá lo recortaría al
    // ancho del panel — el recorte horizontal real lo hace el viewport del
    // propio carrusel (y el root de la app, que ya es overflow-hidden).
    <div className="relative flex h-full flex-col items-center gap-5 px-4 pb-4 pt-5 sm:pt-6 lg:px-0 lg:pt-30">
      {/* Encabezado: apilado y centrado en mobile; en desktop una sola fila
          del ancho del carrusel (1160px) con el título a la IZQUIERDA y las
          pestañas de categoría centradas, ambos a la misma altura. */}
      <div className="flex w-full flex-col items-center gap-5 lg:relative lg:mx-auto lg:w-[1160px] lg:max-w-full lg:flex-row lg:justify-center lg:gap-0">
        {/* Título más grande en mobile/tablet; en desktop conserva su
            tamaño original (text-2xl) y su posición absoluta a la izquierda. */}
        <h2 className="text-2xl font-extrabold text-[#12141A] sm:text-3xl lg:absolute lg:left-3 lg:top-1/2 lg:-translate-y-1/2 lg:text-2xl">
          Selecciona tu vehículo
        </h2>

        {/* Pestañas de categoría: en mobile/tablet ocupan TODO el ancho, con
            padding y tipografía reducidos para que "Comercial" no desborde
            su botón; en desktop vuelven a ajustarse a su contenido. */}
        <div className="flex w-full items-center gap-1 rounded-full bg-white p-1 shadow-sm lg:w-auto">
          {categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => onCategoryChange(c.slug)}
              className={cn(
                "flex-1 whitespace-nowrap rounded-full px-1.5 py-2 text-[13px] font-semibold transition-colors sm:px-5 sm:text-sm lg:flex-none",
                c.slug === activeCategorySlug ? "bg-[#111318] text-white" : "text-[#6B7280] hover:text-[#12141A]"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Cambio de categoría: el carrusel saliente se desliza con fade hacia
          la izquierda (la tarjeta activa "se traslada" hacia un lado junto
          con el set viejo) y el set nuevo ENTRA con fade + slide desde el
          lado opuesto (mode="wait": primero sale uno, después entra el
          otro). El remount por key además recaptura el startIndex de Embla
          para arrancar bien centrado en el set nuevo. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeCategorySlug}
          initial={{ opacity: 0, x: 80 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -80 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="min-h-0 w-full flex-1"
        >
          {vehicles.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[#6B7280]">
              Próximamente en esta categoría.
            </div>
          ) : (
            <CategoryCarousel
              vehicles={vehicles}
              activeVehicleSlug={activeVehicleSlug}
              onSelectVehicle={onSelectVehicle}
              onConfirmVehicle={onConfirmVehicle}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Carrusel de UNA categoría — componente propio para que el cambio de
 * categoría lo REMONTE completo (key en CatalogPanel): Embla arranca de cero
 * con el set nuevo (startIndex fresco) y la animación de entrada/salida no
 * arrastra estado del set anterior.
 */
function CategoryCarousel({
  vehicles,
  activeVehicleSlug,
  onSelectVehicle,
  onConfirmVehicle,
}: Pick<CatalogPanelProps, "vehicles" | "activeVehicleSlug" | "onSelectVehicle" | "onConfirmVehicle">) {
  const activeIndex = Math.max(0, vehicles.findIndex((v) => v.slug === activeVehicleSlug));
  // También con UN solo vehículo se repite el set (antes quedaba una única
  // tarjeta centrada con los lados vacíos): el carrusel debe mostrar SIEMPRE
  // al menos 3 tarjetas visibles, aunque sean copias del mismo vehículo.
  const repeatCount = vehicles.length === 0 ? 0 : Math.max(2, Math.ceil(MIN_LOOP_SLIDES / vehicles.length));
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
  // y al reinicializar, siguiendo siempre a la tarjeta del medio. La card
  // que queda ACTIVA además actualiza el vehículo previsualizado en el
  // héroe (mismo criterio que el carrusel de colores: snap centrado =
  // selección) — al deslizar, no hace falta tocar la tarjeta.
  const [centeredIndex, setCenteredIndex] = useState(initialIndex);
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      setCenteredIndex(idx);
      const centered = loopVehicles[idx];
      if (centered && centered.slug !== activeVehicleSlug) onSelectVehicle(centered.slug);
    };
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, loopVehicles, activeVehicleSlug, onSelectVehicle]);

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
    <div className="relative h-full w-full">
      {/* Viewport FULL-BLEED: ocupa el 100% del ancho de la PANTALLA en
          todos los tamaños (w-screen + margen negativo para romper el
          padding del panel, mismo truco que el carrusel de colores) — las
          tarjetas van de extremo a extremo, recortadas por los bordes. */}
      <div
        className="ml-[calc(50%-50vw)] h-full w-screen cursor-grab overflow-hidden active:cursor-grabbing"
        ref={emblaRef}
      >
        <div className="flex h-full items-center">
              {loopVehicles.map((v, i) => {
                // Posicional, no por slug: solo la copia centrada se pinta.
                const isActive = i === centeredIndex;
                return (
                  // Slide: la separación entre tarjetas se hace con padding
                  // (no con `gap` del contenedor) — Embla mide el ancho de
                  // cada slide por su propio bounding box, y con loop:true
                  // el "gap" del contenedor flex no se replica en la costura
                  // donde el carrusel envuelve del último slide al primero,
                  // dejando ese punto sin separación. El padding sí queda
                  // dentro del propio slide y viaja con él. basis = ancho de
                  // tarjeta + padding (ej. mobile 174 = 150 + 24 de gap).
                  <div
                    key={`${v.slug}-${i}`}
                    className="flex min-w-0 shrink-0 grow-0 basis-[174px] px-3 sm:basis-[236px] sm:px-2 lg:basis-[232px] lg:px-1.5"
                  >
                  <button
                    type="button"
                    onClick={() => handleSelect(v.slug, i)}
                    // El primer clic del doble clic ya seleccionó este
                    // vehículo — el doble clic solo confirma y cierra.
                    onDoubleClick={onConfirmVehicle}
                    className={cn(
                      // cursor-pointer SIEMPRE al hacer hover sobre una card
                      // (pisa el cursor-grab del viewport del carrusel).
                      "relative flex h-[230px] w-full cursor-pointer flex-col justify-between overflow-hidden rounded-2xl p-4 text-left transition-colors duration-300 sm:h-[180px] lg:h-[180px]",
                      isActive ? "bg-[#5D95B7] text-white" : "bg-[#FBFBFB] text-[#12141A]"
                    )}
                  >
                    <div>
                      <p className="text-base font-bold leading-tight">{v.commercialName}</p>
                      <p className={cn("text-xs", isActive ? "text-white/80" : "text-[#6B7280]")}>{v.typeTag}</p>
                    </div>
                    {/* Ícono "Ingresar" (flecha hacia la puerta del
                        vehículo) — SOLO en la card activa y con vehículo
                        disponible: BLANCO, sin fondo, CENTRADO en la card.
                        En mobile un TAP sobre él entra directo a los
                        controles del visualizador (stopPropagation: no
                        re-dispara la selección); en desktop quien confirma
                        es el DOBLE clic, que burbujea hasta el
                        onDoubleClick de la card — un clic simple ahí solo
                        re-selecciona la misma card. */}
                    {isActive && isVehicleAvailable(v) && (
                      <span
                        role="button"
                        aria-label="Ingresar al vehículo"
                        title="Ingresar"
                        onClick={(e) => {
                          if (!window.matchMedia("(min-width: 1024px)").matches) {
                            e.stopPropagation();
                            onConfirmVehicle();
                          }
                        }}
                        className="group absolute left-1/2 top-1/2 z-20 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center text-white/75"
                      >
                        <EnterVehicleIcon className="h-14 w-14 drop-shadow-md transition-transform group-hover:scale-110" />
                      </span>
                    )}
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
                          src={iconAssetUrl(icon)}
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
  );
}
