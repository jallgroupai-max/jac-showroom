"use client";

import { motion } from "framer-motion";
import type { PointOfInterest } from "@/lib/types";
import { poiImageAssetUrl } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface PoiDetailPanelProps {
  poi: PointOfInterest;
  onClose: () => void;
  /** Distancia en px desde el borde inferior del viewport hasta el borde
   * inferior de la card — SOLO desktop. Calculado en showroom-app.tsx como
   * `window.innerHeight - toolbar.getBoundingClientRect().top + 20`, así
   * la card queda siempre a exactamente 20px por encima de la toolbar de
   * puntos de interés (pedido explícito), sin importar cuánto mida esa
   * toolbar. `undefined` en mobile: ahí la posición la resuelve el CSS de
   * abajo (hoja fija al 45%). */
  desktopBottomOffset?: number;
}

/**
 * Panel de detalle de un punto de interés EXTERIOR — reemplaza al tooltip
 * chico de PointsOfInterest. Mismo componente resuelve dos layouts bien
 * distintos vía clases responsive:
 * - Mobile/tablet (<lg): hoja fija anclada abajo, como el formulario "Me
 *   interesa", pero topeada en `top-[45%]` (pedido explícito) en vez de
 *   subir a pantalla completa. Ocupa el 45% inferior de la pantalla (top +
 *   bottom:0 fijan el alto, `h-full` en la card lo hereda) con scroll
 *   propio si el contenido no entra.
 * - Desktop (≥lg): card flotante SOBRE el fondo del héroe — el vehículo NO
 *   se mueve (pedido explícito) — pegada abajo a la izquierda, a 20px justo
 *   ENCIMA de la toolbar de puntos de interés (`desktopBottomOffset`,
 *   medido en vivo — no un padding adivinado).
 */
export function PoiDetailPanel({ poi, onClose, desktopBottomOffset }: PoiDetailPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={desktopBottomOffset != null ? { bottom: desktopBottomOffset } : undefined}
      className={cn(
        "pointer-events-auto z-30",
        "fixed inset-x-0 top-[45%] bottom-0",
        // En desktop esta caja se estira todo el ancho del héroe (lg:inset-x-0)
        // pero es en su mayoría aire transparente — el `bottom` real lo pone
        // el inline style de arriba. Si quedara pointer-events-auto en toda
        // esa franja, tapaba clics sobre la toolbar de puntos de interés que
        // vive más abajo en el mismo héroe (bug reportado: no se podía
        // elegir otro botón con el panel abierto). Solo la card interior
        // (más abajo) vuelve a activar los clics. `lg:top-auto` cancela el
        // `top-[45%]` de mobile: acá el alto lo da el propio contenido.
        // `lg:pb-4` es un colchón mínimo por defecto (interior, sin
        // `desktopBottomOffset`) para que la card no quede pegada al ras
        // del borde inferior del héroe, encima de la barra de controles.
        "lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-auto lg:bg-transparent lg:pb-4 lg:pl-8"
      )}
    >
      <div className="relative flex h-full w-full flex-col overflow-x-hidden overflow-y-auto rounded-t-3xl bg-white text-left shadow-2xl lg:pointer-events-auto lg:h-auto lg:max-w-md lg:flex-row lg:rounded-3xl">
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
            src={poiImageAssetUrl(poi.image)}
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
