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
    <div className="absolute inset-0 overflow-hidden">
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
            className="absolute inset-0 h-full w-full object-cover"
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
