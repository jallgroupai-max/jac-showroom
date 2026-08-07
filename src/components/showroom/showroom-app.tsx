"use client";

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Scene, ViewMode } from "@/lib/types";
import {
  CATEGORIES,
  DEFAULT_VEHICLE_SLUG,
  SCENES,
  getVehicleBySlug,
  getVehiclesByCategory,
  isVehicleAvailable,
} from "@/lib/mock-data";
import { spriteCacheKey } from "@/lib/sprite-cache";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { LoadingScreen } from "./loading-screen";
import { Header } from "./header";
import { SpriteViewer } from "./sprite-viewer";
import { CatalogPanel } from "./catalog-panel";
import { VisualizerControls } from "./visualizer-controls";
import { PointsOfInterest } from "./points-of-interest";
import { SpecsPanel } from "./specs-panel";
import { LeadForm } from "./lead-form";
import { LeadConfirmation } from "./lead-confirmation";

type SubPhase = "catalog" | "visualizer";

interface ShowroomAppProps {
  initialVehicleSlug?: string;
}

// Corte "desktop" — mismo breakpoint que el `lg` de Tailwind (1024px),
// usado tanto acá (JS) como en las clases responsive del JSX de abajo.
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeToDesktopQuery(callback: () => void): () => void {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getDesktopSnapshot(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * Orquestador principal — máquina de estados del showroom.
 * Ver docs/APP-FLOW.md para el diagrama completo de flujo.
 *
 * Desktop (≥1024px, no negociable):
 * - El body (fondo + vehículo) ocupa siempre 100% del alto disponible
 *   (100dvh - header) — los controles flotan ENCIMA, no le restan espacio.
 * - La vista arranca directo mostrando el vehículo por defecto con sus
 *   controles ya visibles (modo "visualizador"), sin pasar primero por el
 *   selector de catálogo.
 *
 * Mobile/tablet (<1024px, diseño distinto al de desktop):
 * - TODO encaja en los 100dvh de la pantalla SIN scroll vertical (pedido
 *   explícito): el héroe es flex-1 y absorbe el alto que dejan libre el
 *   header, el catálogo/controles y el CTA "Me Interesa".
 * - Arranca en el selector de catálogo (sin cambios).
 * - Sin pod de girar/zoom, sin botones en el header (ni pantalla completa
 *   ni "Me Interesa") ni toolbar de POI — el CTA "Me Interesa" vive en una
 *   barra nueva en flujo normal, debajo del catálogo/controles (NO fija ni
 *   flotante), y el header solo muestra logo + título.
 */
export function ShowroomApp({ initialVehicleSlug }: ShowroomAppProps) {
  const startVehicle = getVehicleBySlug(initialVehicleSlug ?? "") ?? getVehicleBySlug(DEFAULT_VEHICLE_SLUG)!;

  const [phase, setPhase] = useState<"loading" | "app">("loading");
  // subPhase explícito: null hasta que el usuario interactúa (cambia de
  // vehículo, abre el catálogo, etc.) — mientras sea null, la vista
  // efectiva se deriva de isDesktop (ver más abajo). Una vez que el
  // usuario interactúa, su elección manda y ya no depende del viewport.
  const [subPhaseOverride, setSubPhaseOverride] = useState<SubPhase | null>(null);
  const [activeCategorySlug, setActiveCategorySlug] = useState(startVehicle.categorySlug);
  const [activeVehicleSlug, setActiveVehicleSlug] = useState(startVehicle.slug);
  const [activeVariantId, setActiveVariantId] = useState(startVehicle.variants[0].id);
  const [viewMode, setViewMode] = useState<ViewMode>("exterior");
  const [sceneId, setSceneId] = useState<Scene["id"]>("own");
  const [specsOpen, setSpecsOpen] = useState(false);
  const [leadFormOpen, setLeadFormOpen] = useState(false);
  const [leadConfirmationOpen, setLeadConfirmationOpen] = useState(false);
  // El hint de "arrastra para rotar" parpadea hasta la PRIMERA rotación de la
  // sesión (cualquier vehículo) — al comenzar a rotar DESAPARECE (fade out).
  const [hasRotated, setHasRotated] = useState(false);

  // Sincronización con matchMedia vía useSyncExternalStore (patrón
  // recomendado por React para esto — sin efecto, sin setState-in-effect).
  // getServerSnapshot devuelve false para que SSR/primer render de
  // hidratación coincidan; React ya se encarga de re-renderizar con el
  // valor real del cliente apenas hidrata, sin parpadeo visible porque
  // esto corre durante la fase "loading" (antes de que se vea el body).
  const isDesktop = useSyncExternalStore(subscribeToDesktopQuery, getDesktopSnapshot, () => false);
  const subPhase: SubPhase = subPhaseOverride ?? (isDesktop ? "visualizer" : "catalog");
  const setSubPhase = setSubPhaseOverride;

  // "Pantalla completa" simulada dentro de la propia página (no la
  // Fullscreen API nativa) — el Header es siempre `fixed` (ver header.tsx),
  // así el cambio de modo nunca salta de `position` (eso no se anima). Lo
  // que sí anima, con Framer Motion, es el alto que le reserva el wrapper
  // de abajo: headerHeight normal, 0 en pantalla completa — el héroe crece
  // detrás del header (que se vuelve transparente) en vez de saltar.
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  // Posición del pointerdown sobre el héroe — distingue clic de arrastre
  // para el cierre del selector de vehículos.
  const heroPressRef = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => setHeaderHeight(header.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
    // `phase` es dependencia a propósito: mientras `phase === "loading"` el
    // Header ni siquiera está montado (return anticipado más abajo), así
    // que el efecto debe re-correr cuando pasa a "app" y headerRef ya
    // apunta al nodo real. `useLayoutEffect` (no `useEffect`) para medir
    // antes del primer paint y que el spacer nunca arranque en 0 con flash.
  }, [phase]);

  const vehicle = getVehicleBySlug(activeVehicleSlug) ?? startVehicle;
  const variant = vehicle.variants.find((v) => v.id === activeVariantId) ?? vehicle.variants[0];
  const vehiclesInCategory = useMemo(() => getVehiclesByCategory(activeCategorySlug), [activeCategorySlug]);

  const spriteSets = viewMode === "exterior" ? variant.exteriorSprites : vehicle.interior.sprites;
  const cacheKey = spriteCacheKey(vehicle.slug, viewMode === "exterior" ? activeVariantId : "interior");
  const activeScene = sceneId === "own" ? undefined : SCENES.find((s) => s.id === sceneId);
  const backgroundColor = activeScene?.color;
  const backgroundUrl = backgroundColor ? undefined : (activeScene?.imageUrl ?? vehicle.ownBackgroundUrl);

  // Clic simple en una tarjeta: solo cambia el vehículo (se previsualiza en
  // el héroe detrás) y el selector QUEDA abierto — los controles de color y
  // demás no se despliegan todavía. El selector se cierra con doble clic
  // sobre la tarjeta o con un clic fuera de la sección (ver abajo).
  function selectVehicle(slug: string) {
    const next = getVehicleBySlug(slug);
    if (!next) return;
    setActiveVehicleSlug(slug);
    setActiveVariantId(next.variants[0].id);
    // El modo Exterior/Interior PERSISTE al cambiar de vehículo (confirmado
    // en conversación) — no se resetea acá.
  }

  function confirmVehicle() {
    // Un vehículo NO disponible (sin modelo 360°) no tiene detalle al que
    // entrar: ni el doble clic ni el clic fuera cierran el selector — solo
    // se puede confirmar un vehículo disponible.
    const active = getVehicleBySlug(activeVehicleSlug);
    if (!active || !isVehicleAvailable(active)) return;
    setSubPhase("visualizer");
  }

  function changeCategory(slug: string) {
    setActiveCategorySlug(slug);
  }

  if (phase === "loading") {
    // El Loading precarga TODOS los colores del vehículo inicial (hasta la
    // calidad que dicte la conexión) más cards/íconos/backgrounds — ver
    // loading-screen.tsx.
    return <LoadingScreen vehicle={startVehicle} onReady={() => setPhase("app")} />;
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[#F4F6F9]">
      <motion.div
        className="shrink-0"
        initial={false}
        animate={{ height: isFullscreen ? 0 : headerHeight }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
      >
        <Header
          ref={headerRef}
          title={`${vehicle.commercialName} ${vehicle.trimLabel}`}
          onMeInteresa={() => setLeadFormOpen(true)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      </motion.div>

      {/* Body/héroe — flex-1 en TODOS los tamaños: absorbe el alto libre
          para que la página completa encaje en 100dvh sin scroll vertical
          (en desktop los controles de abajo salen del flujo con lg:absolute
          y el héroe reclama todo el espacio).
          Con el selector de vehículos abierto, un CLIC fuera de esa sección
          (sobre el héroe) lo cierra y vuelve a los controles — con umbral de
          movimiento para que un arrastre de rotación no cuente como clic. */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onPointerDown={(e) => {
          heroPressRef.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
          const press = heroPressRef.current;
          heroPressRef.current = null;
          if (subPhase !== "catalog") return;
          if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) return;
          confirmVehicle();
        }}
      >
        {/* El viewer queda SIEMPRE montado (sin key por vehículo ni slide de
            pantalla completa): al cambiar de vehículo solo cambian
            cacheKey/spriteSets/vehicleKey y el propio viewer hace la
            transición en su lugar — crossfade (fade out del viejo, fade in
            del nuevo) entre vehículos, barrido para cambios de color.
            Al abrir el selector de vehículos (solo desktop, donde el
            catálogo flota encima), el héroe completo (fondo + vehículo) se
            desplaza hacia arriba EN PARALELO con el despliegue del carrusel:
            misma duración y curva que la animación del panel de abajo. */}
        <motion.div
          className="absolute inset-0"
          animate={{ y: isDesktop && subPhase === "catalog" ? "-18%" : "0%" }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
        >
          <SpriteViewer
            cacheKey={cacheKey}
            vehicleKey={vehicle.slug}
            spriteSets={spriteSets}
            backgroundUrl={backgroundUrl}
            backgroundColor={backgroundColor}
            isFullscreen={isFullscreen}
            showControls={subPhase === "visualizer"}
            onFirstRotate={() => setHasRotated(true)}
          />
        </motion.div>

        {subPhase === "visualizer" && (
          <button
            type="button"
            onClick={() => setSpecsOpen(true)}
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-l-xl bg-[#111318] px-4 py-2 text-[10px] font-bold tracking-widest text-white [writing-mode:vertical-rl]"
          >
            « ESPEC
          </button>
        )}
      </div>

      {/* El hint de "arrastra para rotar" NO existe en mobile/tablet (pedido
          explícito) — solo en desktop, agrupado con el toolbar de POI. */}

      {/* Controles: fila normal debajo del héroe en mobile/tablet;
          overlay absoluto flotando sobre el héroe desde desktop (lg:). */}
      <div className="relative z-10 shrink-0 px-4 pb-3 sm:px-6 mx-auto lg:absolute lg:inset-x-0 lg:bottom-0 lg:shrink lg:pb-6 max-w-6xl w-full">
        <AnimatePresence mode="wait" initial={false}>
          {subPhase === "catalog" ? (
            <motion.div
              key="catalog"
              initial={{ y: "60%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "60%", opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
              // En desktop rompe el max-w-6xl del contenedor padre y ocupa el
              // 100% del ancho de pantalla (full-bleed) — el carrusel de
              // vehículos va de extremo a extremo.
              className="h-auto lg:h-[25rem] lg:w-screen lg:ml-[calc(50%-50vw)]"
            >
              <CatalogPanel
                categories={CATEGORIES}
                activeCategorySlug={activeCategorySlug}
                onCategoryChange={changeCategory}
                vehicles={vehiclesInCategory}
                activeVehicleSlug={activeVehicleSlug}
                onSelectVehicle={selectVehicle}
                onConfirmVehicle={confirmVehicle}
              />
            </motion.div>
          ) : (
            <motion.div
              key="visualizer-controls"
              initial={{ y: "60%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "60%", opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
              className="flex flex-col gap-3"
            >
              <div className="relative hidden items-center gap-3 lg:flex">
                <PointsOfInterest points={vehicle.pointsOfInterest} mode={viewMode} />
                {/* Centrado absoluto respecto al ancho completo de la fila —
                    los POI de la izquierda no lo desplazan del centro.
                    PARPADEA (opacity 0.2 <-> 1, mismo ritmo que el Loading)
                    y con la primera rotación desaparece con un fade — el
                    transition del exit pisa el repeat Infinity del parpadeo,
                    si no el fade de salida no terminaría nunca. */}
                <AnimatePresence>
                  {!hasRotated && (
                    <motion.div
                      initial={false}
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      exit={{ opacity: 0, transition: { duration: 0.3, ease: "easeOut", repeat: 0 } }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-[#12141A] shadow-sm"
                    >
                      Haz clic y arrastra para rotar{" "}
                      <span className="ml-1 rounded-full bg-[#F4F6F9] px-2 py-0.5 text-[#111318]">360°</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <VisualizerControls
                vehicle={vehicle}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                activeVariantId={activeVariantId}
                onVariantChange={setActiveVariantId}
                scenes={SCENES}
                activeSceneId={sceneId}
                onSceneChange={setSceneId}
                onChangeVehicle={() => setSubPhase("catalog")}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* CTA en mobile/tablet — SOLO visible dentro del visualizador (con
          los controles de color/escena); en el selector de catálogo no
          aparece. En desktop sigue en el header. Botón centrado al 90% del
          ancho, sin barra blanca ni borde (se funde con el fondo de la
          página, fiel al Figma mobile). */}
      {subPhase === "visualizer" && (
        <div className="relative flex shrink-0 justify-center p-3 lg:hidden">
          <button
            type="button"
            onClick={() => setLeadFormOpen(true)}
            className="w-[90%] rounded-full bg-[#111318] py-3.5 text-sm font-semibold text-white transition-transform active:scale-95"
          >
            Me Interesa
          </button>
        </div>
      )}

      <SpecsPanel vehicle={vehicle} open={specsOpen} onOpenChange={setSpecsOpen} />

      <LeadForm
        vehicle={vehicle}
        variant={variant}
        open={leadFormOpen}
        onOpenChange={setLeadFormOpen}
        onSuccess={() => {
          setLeadFormOpen(false);
          setLeadConfirmationOpen(true);
        }}
      />

      <LeadConfirmation
        vehicle={vehicle}
        variant={variant}
        open={leadConfirmationOpen}
        onOpenChange={setLeadConfirmationOpen}
      />
    </div>
  );
}
