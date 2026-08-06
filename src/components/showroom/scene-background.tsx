"use client";

import { AnimatePresence, motion } from "framer-motion";

interface SceneBackgroundProps {
  /** Alternativa a `color` — foto de escena. */
  imageUrl?: string;
  /** Alternativa a `imageUrl` — fondo de color sólido. */
  color?: string;
}

/**
 * Fondo/Escena del showroom, compuesto como capa SEPARADA del sprite del
 * vehículo (docs/TRD.md §4.5, confirmado con el prototipo real: el vehículo
 * se renderiza sobre fondo transparente). La transición entre escenas es un
 * cross-fade suave ("símil atenuación de LED"), nunca un corte instantáneo
 * — aplica igual para fotos que para colores sólidos.
 */
export function SceneBackground({ imageUrl, color }: SceneBackgroundProps) {
  const key = color ?? imageUrl;
  return (
    // La capa del fondo termina un 10% por ENCIMA del borde inferior
    // (bottom-[10%]): la escena queda con un margen inferior respecto al
    // viewport, acompañando al vehículo que se apoya a esa misma altura
    // (ver sprite-viewer.tsx). La máscara desvanece el borde inferior del
    // fondo hacia transparente (del 75% de la altura hacia abajo): la escena
    // se funde con el fondo claro de la página en vez de cortarse con una
    // línea dura — aplica en mobile y desktop por igual, y solo al fondo
    // (el vehículo no se toca).
    <div className="absolute inset-x-0 top-0 bottom-[10%] overflow-hidden [-webkit-mask-image:linear-gradient(to_bottom,#000_75%,transparent_100%)] [mask-image:linear-gradient(to_bottom,#000_75%,transparent_100%)]">
      <AnimatePresence>
        {color ? (
          <motion.div
            key={key}
            aria-hidden
            className="absolute inset-0 h-full w-full"
            style={{ backgroundColor: color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
        ) : (
          <motion.img
            key={key}
            src={imageUrl}
            alt=""
            aria-hidden
            // object-center: la foto queda CENTRADA dentro de la capa del
            // fondo (que ya termina un 10% sobre el borde inferior, ver el
            // contenedor). Sin franjas vacías: el cover siempre llena el
            // contenedor.
            className="absolute inset-0 h-full w-full object-cover object-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
