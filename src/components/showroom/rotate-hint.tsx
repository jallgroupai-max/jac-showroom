"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const HAND_ICON_URL = "/assets/icons/hand.svg";

const BAR_MAX_WIDTH = 528;
const BAR_HEIGHT = 66;
const HAND_SIZE = 53;
const EDGE_PADDING = 11;

/**
 * Hint de "arrastra para rotar": barra rectangular con degradado
 * (transparente SOLO en las puntas, blanca opaca en casi todo el ancho) sobre
 * la que la mano recorre de un extremo al otro en loop. Ancho fluido (casi
 * todo el vehículo) con techo en pantallas grandes — el recorrido de la mano
 * se mide en píxeles reales vía ResizeObserver porque el ancho de la barra ya
 * no es fijo. Reemplaza al hint de texto anterior — mismo criterio de vida en
 * ShowroomApp (desaparece con la primera rotación de la sesión y no vuelve
 * hasta refrescar la página), pero ahora visible en TODOS los tamaños de
 * pantalla.
 */
export function RotateHint() {
  const barRef = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(([entry]) => {
      setTravel(Math.max(0, entry.contentRect.width - HAND_SIZE - EDGE_PADDING * 2));
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={barRef}
      aria-hidden
      className="relative flex w-[70.4vw] items-center shadow-lg sm:w-[56vw]"
      style={{
        maxWidth: BAR_MAX_WIDTH,
        height: BAR_HEIGHT,
        background:
          "linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.98) 14%, rgba(255,255,255,0.98) 86%, rgba(255,255,255,0) 100%)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ícono suelto de recursos/Iconos */}
      <motion.img
        src={HAND_ICON_URL}
        alt=""
        draggable={false}
        style={{ height: HAND_SIZE, width: HAND_SIZE, marginLeft: EDGE_PADDING }}
        animate={{ x: [0, travel, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
