"use client";

import { useEffect, useRef } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
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
      navbar: ["zoom"],
      defaultZoomLvl: 50,
      // Un dedo alcanza para mirar alrededor (igual que en Changan).
      touchmoveTwoFingers: false,
    });
    return () => viewer.destroy();
  }, [imageUrl]);

  return <div ref={containerRef} className="h-full w-full" />;
}
