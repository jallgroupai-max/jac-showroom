"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { MarkerAnchor, PointOfInterest } from "@/lib/types";
import { poiImageAssetUrl } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface PoiDetailPanelProps {
  poi: PointOfInterest;
  onClose: () => void;
  /** Mismo booleano que showroom-app.tsx ya calcula para el resto del hero
   * (media query 1024px) — decide qué recorte de imagen usar: 9:16 desktop
   * o 16:9 mobile. Ambos son recortes DISTINTOS de la misma foto, no una
   * resolución derivada de la otra. */
  isDesktop: boolean;
  /** Distancia en px desde el borde inferior del viewport hasta el borde
   * inferior de la card — SOLO desktop EXTERIOR. Calculado en
   * showroom-app.tsx como `window.innerHeight - toolbar.getBoundingClientRect().top + 20`,
   * así la card queda siempre a exactamente 20px por encima de la toolbar
   * de puntos de interés, sin importar cuánto mida esa toolbar. */
  desktopBottomOffset?: number;
  /** Posición/tamaño (viewport) del marker de INTERIOR clickeado — SOLO
   * desktop. Con esto seteado la card se ancla justo al lado de ese punto
   * de la panorámica (pedido explícito: "la modal debe abrirse justo sobre
   * el punto de interés") en vez de una posición fija, con flip automático
   * al lado izquierdo si no entra a la derecha. Ignorado en mobile — ahí
   * sigue la hoja fija de siempre (anclar una hoja de ancho completo a un
   * punto de la imagen no tiene sentido de layout). */
  anchorRect?: MarkerAnchor;
}

const DESKTOP_QUERY = "(min-width: 1024px)";
const ANCHOR_GAP = 16;
const ANCHOR_MARGIN = 16;

/**
 * Panel de detalle de un punto de interés — reemplaza al tooltip chico de
 * PointsOfInterest. Mismo componente resuelve tres casos vía props:
 * - Mobile/tablet (<lg): hoja fija anclada abajo, como el formulario "Me
 *   interesa", pero topeada en `top-[45%]` (pedido explícito) en vez de
 *   subir a pantalla completa. Ocupa el 45% inferior de la pantalla (top +
 *   bottom:0 fijan el alto, `h-full` en la card lo hereda) con scroll
 *   propio si el contenido no entra. Mismo layout en AMBOS modos — anclar
 *   una hoja de ancho completo a un punto de la imagen no tiene sentido.
 * - Desktop EXTERIOR (`desktopBottomOffset`): card flotante SOBRE el fondo
 *   del héroe (el vehículo NO se mueve) — pegada abajo a la izquierda, a
 *   20px justo ENCIMA de la toolbar de puntos de interés.
 * - Desktop INTERIOR (`anchorRect`): card anclada al lado del marker
 *   clickeado en la panorámica — medida en un `useLayoutEffect` (se
 *   necesita el tamaño real de la card para centrarla y decidir el flip)
 *   en vez de asumir un ancho/alto fijo.
 */
export function PoiDetailPanel({ poi, onClose, desktopBottomOffset, anchorRect, isDesktop }: PoiDetailPanelProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [anchoredPos, setAnchoredPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    // Envuelta en una función nombrada (no `setAnchoredPos` directo) para
    // seguir el mismo patrón que headerHeight/heroHeight más arriba en
    // showroom-app.tsx — mide el DOM real y recién ahí fija el estado.
    const apply = (pos: { left: number; top: number } | null) => setAnchoredPos(pos);
    if (!anchorRect || !window.matchMedia(DESKTOP_QUERY).matches) {
      apply(null);
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    const { width: panelW, height: panelH } = el.getBoundingClientRect();
    const spaceRight = window.innerWidth - (anchorRect.x + anchorRect.width);
    const openLeft = spaceRight < panelW + ANCHOR_GAP + ANCHOR_MARGIN;
    const left = openLeft
      ? Math.max(ANCHOR_MARGIN, anchorRect.x - panelW - ANCHOR_GAP)
      : Math.min(anchorRect.x + anchorRect.width + ANCHOR_GAP, window.innerWidth - panelW - ANCHOR_MARGIN);
    const top = Math.min(
      Math.max(ANCHOR_MARGIN, anchorRect.y + anchorRect.height / 2 - panelH / 2),
      window.innerHeight - panelH - ANCHOR_MARGIN
    );
    apply({ left, top });
  }, [anchorRect]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={anchoredPos ?? (desktopBottomOffset != null ? { bottom: desktopBottomOffset } : undefined)}
      className={cn(
        "pointer-events-auto z-30",
        "fixed inset-x-0 top-[45%] bottom-0",
        // En desktop esta caja se estira todo el ancho del héroe (lg:inset-x-0)
        // pero es en su mayoría aire transparente — la posición real la pone
        // el inline style de arriba. Si quedara pointer-events-auto en toda
        // esa franja, tapaba clics sobre la toolbar de puntos de interés que
        // vive más abajo en el mismo héroe (bug reportado: no se podía
        // elegir otro botón con el panel abierto). Solo la card interior
        // (más abajo) vuelve a activar los clics. `lg:top-auto` cancela el
        // `top-[45%]` de mobile: acá el alto lo da el propio contenido.
        anchoredPos
          ? "lg:pointer-events-none lg:inset-auto lg:bg-transparent"
          : "lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-auto lg:bg-transparent lg:pb-4 lg:pl-8"
      )}
    >
      <div
        ref={cardRef}
        className="relative flex h-full w-full flex-col overflow-x-hidden overflow-y-auto rounded-t-3xl bg-white text-left shadow-2xl lg:pointer-events-auto lg:h-auto lg:max-w-md lg:flex-row lg:rounded-3xl"
      >
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-[#6B7280] shadow-sm backdrop-blur transition-colors hover:bg-[#F4F6F9] hover:text-[#12141A]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        {poi.image && (
          // eslint-disable-next-line @next/next/no-img-element -- imagen suelta de recursos/Iconos
          <img
            src={poiImageAssetUrl(isDesktop ? poi.image : (poi.imageMobile ?? poi.image))}
            alt=""
            aria-hidden
            className="h-36 w-full shrink-0 object-cover lg:h-auto lg:min-h-64 lg:w-[30%] lg:shrink"
          />
        )}
        <div className="shrink-0 p-5 lg:flex lg:w-[70%] lg:flex-col lg:justify-center lg:p-8">
          <p className="text-base font-bold text-[#12141A] lg:text-xl">{poi.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#6B7280] lg:mt-3 lg:text-sm">{poi.description}</p>
        </div>
      </div>
    </motion.div>
  );
}
