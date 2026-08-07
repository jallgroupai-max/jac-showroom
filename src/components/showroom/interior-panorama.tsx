"use client";

import { useEffect, useRef } from "react";
import { EquirectangularAdapter, Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

interface InteriorPanoramaProps {
  /** Panorámica equirectangular del interior. */
  imageUrl: string;
}

/**
 * Visor 360° del INTERIOR — Photo Sphere Viewer, el mismo stack que el
 * showroom de Changan (C:\dev\changan): panorámica equirectangular
 * arrastrable con zoom propio. Mientras está activo ocupa exactamente el
 * espacio del fondo de escena, y fondo + vehículo se retiran (ver
 * sprite-viewer.tsx). El viewer maneja sus PROPIOS gestos — vive fuera del
 * contenedor de drag/zoom del sprite exterior.
 */
export function InteriorPanorama({ imageUrl }: InteriorPanoramaProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewer = new Viewer({
      container,
      panorama: imageUrl,
      // Sin barra de controles: el zoom queda fijo en 75% (rueda/pellizco
      // siguen funcionando, pero sin botones en pantalla).
      navbar: false,
      defaultZoomLvl: 75,
      // Un dedo alcanza para mirar alrededor (igual que en Changan).
      touchmoveTwoFingers: false,
      // La panorámica se lee SIEMPRE por su relación 2:1 (esfera completa),
      // ignorando cualquier metadato XMP de recorte que traiga el archivo —
      // con metadatos parciales la esfera no cerraba y quedaba una franja
      // negra entre los extremos.
      adapter: [EquirectangularAdapter, { useXmpData: false }],
    });
    return () => viewer.destroy();
  }, [imageUrl]);

  return <div ref={containerRef} className="h-full w-full" />;
}
