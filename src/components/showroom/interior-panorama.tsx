"use client";

import { useEffect, useRef } from "react";
import { EquirectangularAdapter, Viewer } from "@photo-sphere-viewer/core";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import type { PointOfInterest } from "@/lib/types";
import { iconAssetUrl } from "@/lib/mock-data";

interface InteriorPanoramaProps {
  /** Panorámica equirectangular del interior. */
  imageUrl: string;
  /** Puntos de interés de INTERIOR con `panoramaPosition` — se dibujan como
   * íconos flotantes anclados a esa posición exacta de la esfera 360 (no a
   * una posición de pantalla): al arrastrar/mirar alrededor, cada ícono se
   * queda pegado sobre el elemento real que representa (pedido explícito).
   * Los que no tengan `panoramaPosition` se ignoran acá. */
  points: PointOfInterest[];
  activeId: string | null;
  onSelectPoint: (id: string) => void;
}

const MARKER_ACTIVE_CLASS = "poi-marker--active";

/**
 * Visor 360° del INTERIOR — Photo Sphere Viewer, el mismo stack que el
 * showroom de Changan (C:\dev\changan): panorámica equirectangular
 * arrastrable con zoom propio. Mientras está activo ocupa exactamente el
 * espacio del fondo de escena, y fondo + vehículo se retiran (ver
 * sprite-viewer.tsx). El viewer maneja sus PROPIOS gestos — vive fuera del
 * contenedor de drag/zoom del sprite exterior.
 */
export function InteriorPanorama({ imageUrl, points, activeId, onSelectPoint }: InteriorPanoramaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markersPluginRef = useRef<MarkersPlugin | null>(null);
  // Callback siempre actualizado sin forzar recreación del viewer — el
  // listener de PSV se registra UNA vez (ver useEffect de abajo). Sincronizado
  // en un efecto (no durante el render) para no mutar un ref en render.
  const onSelectPointRef = useRef(onSelectPoint);
  useEffect(() => {
    onSelectPointRef.current = onSelectPoint;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const markedPoints = points.filter((p) => p.panoramaPosition);
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
      plugins: [
        [
          MarkersPlugin,
          {
            markers: markedPoints.map((poi) => ({
              id: poi.id,
              position: { textureX: poi.panoramaPosition!.textureX, textureY: poi.panoramaPosition!.textureY },
              image: iconAssetUrl(poi.icon),
              size: { width: 44, height: 44 },
              anchor: "center center",
              tooltip: poi.title,
              className: poi.id === activeId ? MARKER_ACTIVE_CLASS : undefined,
            })),
          },
        ],
      ],
    });
    const markersPlugin = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);
    markersPluginRef.current = markersPlugin ?? null;
    markersPlugin?.addEventListener("select-marker", ({ marker }) => onSelectPointRef.current(marker.id));
    return () => {
      markersPluginRef.current = null;
      viewer.destroy();
    };
    // `points` deliberadamente NO está en las deps: son estáticos por
    // vehículo (misma lista de mock-data.ts) — lo que sí cambia es
    // `imageUrl` (vehículo distinto), que ya recrea el viewer entero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Resalta el marker activo (mismo criterio visual que el anillo de los
  // botones de la toolbar exterior) sin recrear el viewer entero.
  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (!plugin) return;
    for (const poi of points) {
      if (!poi.panoramaPosition) continue;
      try {
        plugin.updateMarker({ id: poi.id, className: poi.id === activeId ? MARKER_ACTIVE_CLASS : undefined });
      } catch {
        // El plugin registra los markers de forma asíncrona (recién cuando
        // termina de cargar la panorámica) — este efecto puede correr ANTES
        // de eso, apenas se monta, y updateMarker() tira si el marker
        // todavía no existe (PSVError sin catch acá arriba tumbaba toda la
        // app). No se pierde nada: el estado inicial ya se pasó al crear
        // los markers más arriba, y cualquier cambio de activeId posterior
        // solo puede venir de un clic sobre un marker que, para existir,
        // ya tuvo que terminar de registrarse.
      }
    }
  }, [activeId, points]);

  return <div ref={containerRef} className="h-full w-full" />;
}
