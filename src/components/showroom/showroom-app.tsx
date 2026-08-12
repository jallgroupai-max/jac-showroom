"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MarkerAnchor, Scene, ViewMode } from "@/lib/types";
import { isVehicleAvailable } from "@/lib/mock-data";
import { hydrateCatalog, type CatalogDTO } from "@/lib/catalog-dto";
import { spriteCacheKey } from "@/lib/sprite-cache";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "./loading-screen";
import { Header } from "./header";
import { SpriteViewer } from "./sprite-viewer";
import { CatalogPanel, EnterVehicleIcon } from "./catalog-panel";
import { VisualizerControls } from "./visualizer-controls";
import { PointsOfInterest } from "./points-of-interest";
import { PoiDetailPanel } from "./poi-detail-panel";
import { RotateHint } from "./rotate-hint";
import { SpecsPanel } from "./specs-panel";
import { LeadForm } from "./lead-form";
import { LeadConfirmation } from "./lead-confirmation";

type SubPhase = "catalog" | "visualizer";

interface ShowroomAppProps {
  initialVehicleSlug?: string;
  /** Catálogo serializable armado en el servidor (Fase A5) — se hidrata acá
   * a los tipos de siempre (plan §1.6: frameUrl no cruza la frontera RSC). */
  catalog: CatalogDTO;
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
export function ShowroomApp({ initialVehicleSlug, catalog }: ShowroomAppProps) {
  // Hidratación única del catálogo — misma forma que antes tenía mock-data,
  // los componentes de abajo no distinguen el origen.
  const cat = useMemo(() => hydrateCatalog(catalog), [catalog]);
  const getVehicleBySlug = (slug: string) => cat.vehicles.find((v) => v.slug === slug);
  const startVehicle =
    getVehicleBySlug(initialVehicleSlug ?? "") ?? getVehicleBySlug(cat.defaultSlug)!;

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
  // Al entrar por primera vez se muestra el background CLARO (pedido
  // explícito) — el fondo "propio" del vehículo queda como opción del
  // selector de Escena, ya no como default.
  const [sceneId, setSceneId] = useState<Scene["id"]>("light");
  const [specsOpen, setSpecsOpen] = useState(false);
  const [leadFormOpen, setLeadFormOpen] = useState(false);
  const [leadConfirmationOpen, setLeadConfirmationOpen] = useState(false);
  // El hint de "arrastra para rotar" (mano deslizándose) vive hasta la
  // PRIMERA rotación de la sesión (cualquier vehículo) — al comenzar a rotar
  // DESAPARECE (fade out) y no vuelve a aparecer salvo refresco de página.
  const [hasRotated, setHasRotated] = useState(false);
  // Punto de interés abierto — SOLO tiene efecto visual (corrida del auto +
  // rotación + panel grande) en exterior; ver PointsOfInterest y
  // PoiDetailPanel. Se cierra solo al cambiar de vehículo/modo/subfase para
  // no dejar el auto corrido con un panel de un vehículo que ya no es el
  // activo.
  const [activePoiId, setActivePoiId] = useState<string | null>(null);
  // Posición/tamaño (viewport) del marker de INTERIOR clickeado — captura
  // única al momento del clic (ver InteriorPanorama), no sigue al marker si
  // el usuario sigue arrastrando después. Usada para abrir PoiDetailPanel
  // justo sobre ese punto de la panorámica en vez de en una posición fija
  // (pedido explícito). `null` en exterior (ver PoiDetailPanel: sin esto,
  // usa la posición junto a la toolbar).
  const [interiorPoiAnchor, setInteriorPoiAnchor] = useState<MarkerAnchor | null>(null);

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
  const { isFullscreen, toggleFullscreen, exitFullscreen } = useFullscreen();
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  // Toolbar de puntos de interés — SOLO en desktop, para anclar el panel de
  // detalle justo arriba de ella con 20px de separación (pedido explícito).
  // Se mide con getBoundingClientRect().top y se convierte a un `bottom` en
  // px (distancia real al borde inferior del viewport + el gap deseado) —
  // más preciso que adivinar un padding fijo.
  const poiToolbarRef = useRef<HTMLDivElement>(null);
  const [desktopPanelBottom, setDesktopPanelBottom] = useState(0);
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

  // "Pantalla completa" solo tiene botón para activarse en desktop o en
  // mobile/tablet HORIZONTAL (ver sprite-viewer.tsx) — si el usuario rota el
  // celular de vuelta a vertical estando en ese modo, se desactiva sola:
  // portrait ya encaja todo en el 100dvh por diseño y no necesita (ni tiene
  // cómo salir de) pantalla completa.
  useEffect(() => {
    const mql = window.matchMedia("(orientation: portrait)");
    const onChange = () => {
      if (mql.matches && !getDesktopSnapshot()) exitFullscreen();
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [exitFullscreen]);

  const vehicle = getVehicleBySlug(activeVehicleSlug) ?? startVehicle;
  const variant = vehicle.variants.find((v) => v.id === activeVariantId) ?? vehicle.variants[0];
  const vehiclesInCategory = useMemo(
    () =>
      cat.vehicles
        .filter((v) => v.categorySlug === activeCategorySlug)
        .sort((a, b) => a.order - b.order),
    [cat.vehicles, activeCategorySlug],
  );

  // Interior disponible = sprites 360° o foto única. Si el vehículo activo
  // no lo tiene, la vista EFECTIVA cae a exterior aunque el estado siga en
  // "interior" (p. ej. cambió de vehículo estando en Interior).
  const interiorAvailable = vehicle.interior.sprites.length > 0 || Boolean(vehicle.interior.imageUrl);
  const effectiveViewMode: ViewMode = interiorAvailable ? viewMode : "exterior";

  useLayoutEffect(() => {
    const el = poiToolbarRef.current;
    if (!el) return;
    const GAP = 20;
    const update = () => setDesktopPanelBottom(window.innerHeight - el.getBoundingClientRect().top + GAP);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
    // `subPhase` a propósito: la toolbar solo existe en el DOM con
    // subPhase === "visualizer". `effectiveViewMode` TAMBIÉN a propósito —
    // bug real: la toolbar (con ella este ref) se desmonta al pasar a
    // Interior y remonta como un nodo NUEVO al volver a Exterior; sin esta
    // dependencia el efecto no volvía a correr, `poiToolbarRef.current`
    // apuntaba al nodo viejo (ya desconectado, el ResizeObserver nunca
    // volvía a disparar) y `desktopPanelBottom` quedaba congelado en el
    // último valor — el panel de exterior se abría fuera de pantalla tras
    // un viaje ida y vuelta a Interior.
  }, [phase, subPhase, effectiveViewMode]);

  const spriteSets = effectiveViewMode === "exterior" ? variant.exteriorSprites : vehicle.interior.sprites;
  // Interior con panorámica única: el viewer monta el visor 360° (Photo
  // Sphere Viewer) en lugar del sprite exterior. Cada dispositivo recibe SU
  // variante: mobile ≤4096px (límite de textura de GPU móvil), desktop la
  // de mayor resolución.
  const interiorImageUrl =
    effectiveViewMode === "interior"
      ? isDesktop
        ? vehicle.interior.imageUrl
        : (vehicle.interior.imageUrlMobile ?? vehicle.interior.imageUrl)
      : undefined;
  const cacheKey = spriteCacheKey(vehicle.slug, effectiveViewMode === "exterior" ? activeVariantId : "interior");
  // Escenarios personalizados habilitados para ESTE vehículo (Req 8) — el
  // catálogo global filtrado por la selección hecha en el panel.
  const vehicleCustomScenes = useMemo(() => {
    const enabledIds = cat.scenarioIdsBySlug[vehicle.slug] ?? [];
    return cat.customScenes.filter((s) => enabledIds.includes(s.id));
  }, [cat, vehicle.slug]);
  const activeScene =
    sceneId === "own" ? undefined : [...cat.scenes, ...vehicleCustomScenes].find((s) => s.id === sceneId);
  const backgroundColor = activeScene?.color;
  const backgroundUrl = backgroundColor ? undefined : (activeScene?.imageUrl ?? vehicle.ownBackgroundUrl);
  // El panel de detalle aplica en AMBOS modos — en exterior además corre el
  // auto (targetFrame más abajo); en interior el punto de interés vive como
  // ícono flotante sobre la panorámica (ver interiorPoints/InteriorPanorama),
  // sin equivalente de "correr el auto".
  const activePoi = vehicle.pointsOfInterest.find((p) => p.id === activePoiId);
  const interiorPoints = vehicle.pointsOfInterest.filter((p) => p.mode === "interior");

  // Cierra el punto de interés abierto al cambiar de modo — evita quedar con
  // el auto corrido y el panel de un modo que ya no es el activo (p. ej. se
  // pasó a Interior con el panel de exterior abierto). Se llama en el
  // handler, NO en un efecto, para no disparar un set-state-en-efecto
  // encadenado (regla del proyecto).
  function changeViewMode(mode: ViewMode) {
    setActivePoiId(null);
    setViewMode(mode);
  }

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
    // en conversación) — no se resetea acá. El punto de interés abierto SÍ
    // se cierra: quedaba corriendo el auto/panel de un vehículo distinto.
    setActivePoiId(null);
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
    return (
      <LoadingScreen
        vehicle={startVehicle}
        vehicles={cat.vehicles}
        scenes={[...cat.scenes, ...cat.customScenes]}
        onReady={() => setPhase("app")}
      />
    );
  }

  return (
    // Portrait (mobile/tablet) y desktop: BLOQUEADO sin scroll — el héroe
    // flex-1 absorbe exactamente el alto libre y todo encaja en el 100dvh.
    // Landscape mobile/tablet (max-lg): el contenido (héroe + controles +
    // CTA) no entra en el poco alto disponible — se habilita scroll vertical
    // como escape, único caso donde el usuario podía quedar atrapado sin
    // poder ver el botón "Me Interesa".
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[#F4F6F9] max-lg:landscape:overflow-y-auto">
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
          hideOnMobile={isFullscreen}
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
        // min-h-0 (base): el héroe se achica lo que haga falta para que TODO
        // encaje en 100dvh sin scroll (portrait y desktop). Piso de 200px
        // SOLO en landscape mobile/tablet (donde sí hay scroll de escape) —
        // sin él, el flex-1 lo aplastaba hasta casi desaparecer.
        className="relative min-h-0 flex-1 overflow-hidden max-lg:landscape:min-h-[200px]"
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
            panoramaUrl={interiorImageUrl}
            onClosePanorama={() => changeViewMode("exterior")}
            interiorPoints={interiorPoints}
            activePoiId={activePoiId}
            onSelectPoi={(id, anchor) => {
              setActivePoiId((cur) => (cur === id ? null : id));
              setInteriorPoiAnchor(anchor);
            }}
            backgroundUrl={backgroundUrl}
            backgroundColor={backgroundColor}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            showControls={subPhase === "visualizer"}
            onFirstRotate={() => setHasRotated(true)}
            targetFrame={activePoi?.frame}
          />

          {/* Botón de INGRESO flotando encima del carro — visible solo con
              el selector de vehículos abierto y vehículo disponible
              (reemplaza al ícono que vivía en la card). Viaja con el héroe
              cuando este se desplaza en desktop. Círculo con SOLO el ícono
              (sin texto), un poco más grande en mobile; el fondo
              semitransparente con backdrop-blur deja ver el carro
              difuminado a través del botón. */}
          {subPhase === "catalog" && isVehicleAvailable(vehicle) && (
            <button
              type="button"
              aria-label="Ver vehículo"
              title="Ver vehículo"
              onClick={(e) => {
                e.stopPropagation();
                confirmVehicle();
              }}
              className="absolute left-1/2 top-[42%] z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 text-[#12141A] shadow-lg backdrop-blur transition-transform hover:scale-110 lg:h-14 lg:w-14"
            >
              <EnterVehicleIcon className="h-9 w-9 lg:h-8 lg:w-8" />
            </button>
          )}
        </motion.div>

        {/* Hint de "arrastra para rotar": mano deslizándose sobre la barra,
            centrada sobre el vehículo. Visible en TODOS los tamaños (el
            drag para rotar funciona igual en touch) mientras el vehículo
            esté a la vista (exterior, visualizador abierto) y hasta la
            primera rotación de la sesión — ver hasRotated arriba. */}
        <AnimatePresence>
          {!hasRotated && subPhase === "visualizer" && effectiveViewMode === "exterior" && (
            <motion.div
              key="rotate-hint"
              initial={false}
              animate={{ opacity: [0.85, 1, 0.85] }}
              exit={{ opacity: 0, transition: { duration: 0.3, ease: "easeOut", repeat: 0 } }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center"
            >
              <RotateHint />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fondo de clic-afuera: al abrir un punto de interés, cualquier clic
            sobre el héroe (fondo o vehículo) cierra el panel — pedido
            explícito. Vive DEBAJO de PoiDetailPanel (z-30) así que un clic
            DENTRO de la card nunca llega acá. BUG REAL que hubo acá: el
            bloque de controles (toolbar de puntos de interés incluida)
            flota EN DESKTOP sobre el borde inferior del héroe vía
            `lg:absolute lg:bottom-0` con z-10 — con este fondo en z-20
            (por encima de esa toolbar) cualquier clic sobre OTRO botón de
            punto de interés, con un panel ya abierto, le pegaba a este
            fondo en vez de al botón real: cerraba el panel actual pero
            nunca abría el siguiente. z-[5] (por debajo de la toolbar/tab
            ESPEC/hint, todos z-10) deja pasar esos clics a sus botones
            reales y solo intercepta clics sobre el fondo/vehículo. */}
        <AnimatePresence>
          {activePoi && (
            <motion.button
              type="button"
              aria-label="Cerrar punto de interés"
              key="poi-backdrop"
              onClick={() => setActivePoiId(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-[5] cursor-default bg-transparent"
            />
          )}
        </AnimatePresence>

        {/* Panel del punto de interés abierto — PoiDetailPanel resuelve tres
            casos vía props:
            - Mobile/tablet (<lg): hoja fija topeada al 45% de la pantalla
              (pedido explícito), sin importar el modo.
            - Desktop EXTERIOR: card flotando junto al vehículo, pegada
              justo arriba de la toolbar de puntos de interés — 20px de
              separación (desktopPanelBottom, medido en vivo).
            - Desktop INTERIOR: card anclada justo sobre el marker
              clickeado en la panorámica (anchorRect, capturado al clic en
              InteriorPanorama) — pedido explícito. Se gatea por
              effectiveViewMode (no solo por si `interiorPoiAnchor` es
              null) por la misma razón que `desktopBottomOffset`: sin eso,
              un valor viejo de un modo se cuela en el otro. */}
        <AnimatePresence>
          {activePoi && (
            <PoiDetailPanel
              key={activePoi.id}
              poi={activePoi}
              onClose={() => setActivePoiId(null)}
              desktopBottomOffset={isDesktop && effectiveViewMode === "exterior" ? desktopPanelBottom : undefined}
              anchorRect={effectiveViewMode === "interior" ? (interiorPoiAnchor ?? undefined) : undefined}
              isDesktop={isDesktop}
            />
          )}
        </AnimatePresence>

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

      {/* Controles: fila normal debajo del héroe en mobile/tablet; overlay
          absoluto flotando sobre el héroe desde desktop (lg:). En "pantalla
          completa" MOBILE se ocultan (max-lg:hidden) para maximizar el
          área visible del 360 — en desktop flotan sobre el héroe sin
          restarle espacio, así que ahí se mantienen visibles siempre. */}
      <div
        className={cn(
          "relative z-10 shrink-0 px-4 pb-3 sm:px-6 mx-auto lg:absolute lg:inset-x-0 lg:bottom-0 lg:shrink lg:pb-6 max-w-6xl w-full",
          isFullscreen && "max-lg:hidden"
        )}
      >
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
                categories={cat.categories}
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
              {/* Solo EXTERIOR usa la toolbar de botones — en interior cada
                  punto de interés vive como ícono flotante sobre la propia
                  panorámica (ver interiorPoints/InteriorPanorama), así que
                  no hace falta (ni tendría sentido) repetirlos acá abajo. */}
              {effectiveViewMode === "exterior" && (
                <div ref={poiToolbarRef} className="relative flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                  <PointsOfInterest
                    points={vehicle.pointsOfInterest}
                    mode={effectiveViewMode}
                    activeId={activePoiId}
                    onActiveChange={setActivePoiId}
                    hideInlineDetail
                    isDesktop={isDesktop}
                  />
                </div>
              )}
              <VisualizerControls
                vehicle={vehicle}
                viewMode={effectiveViewMode}
                onViewModeChange={changeViewMode}
                activeVariantId={activeVariantId}
                onVariantChange={setActiveVariantId}
                scenes={cat.scenes}
                customScenes={vehicleCustomScenes}
                activeSceneId={sceneId}
                onSceneChange={setSceneId}
                // Al abrir el selector de vehículos SIEMPRE se vuelve a
                // Exterior: si quedaba activo el 360 interior, el panorama
                // seguía montado tapando la previsualización del catálogo.
                onChangeVehicle={() => {
                  changeViewMode("exterior");
                  setSubPhase("catalog");
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* CTA en mobile/tablet — SOLO visible dentro del visualizador (con
          los controles de color/escena); en el selector de catálogo no
          aparece, y tampoco en "pantalla completa" (mismo criterio que los
          controles de arriba). En desktop sigue en el header. Botón
          centrado al 90% del ancho, sin barra blanca ni borde (se funde con
          el fondo de la página, fiel al Figma mobile). */}
      {subPhase === "visualizer" && !isFullscreen && (
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
        dealers={cat.dealers}
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
