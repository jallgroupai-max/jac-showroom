"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Viewer, EquirectangularAdapter } from "@photo-sphere-viewer/core";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import { saveInteriorPoi, deletePoi } from "../poi-actions";
import { HotspotIconImage } from "./catalog-icon";

// Paso 5 — Imagen 360° del interior y puntos de interés (Req 6/7).
//
// El editor usa EXACTAMENTE el mismo stack que el visor público
// (interior-panorama.tsx): Photo Sphere Viewer + MarkersPlugin, con el mismo
// adapter equirectangular. La matemática de coordenadas es de PSV en ambos
// lados — el clic devuelve textureX/textureY y los markers se posicionan con
// esos mismos valores, así que lo que se coloca aquí es lo que se ve allá,
// por construcción. Se guardan NORMALIZADOS 0–1 (plan §1.5): sobreviven a
// re-subir la panorámica en otra resolución.

export type InteriorPoi = {
  id: string;
  iconId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  iconSize: number;
  textureX: number | null;
  textureY: number | null;
  blink: "SOFT" | "FAST" | "NONE";
};

export type InteriorIconOption = {
  id: string;
  key: string;
  label: string;
  svgPath: string;
  assetName: string | null;
};

const BLINK_LABELS: Record<InteriorPoi["blink"], string> = {
  SOFT: "Suave",
  FAST: "Rápido",
  NONE: "Sin parpadeo",
};

export function Step5Interior({
  vehicleId,
  panoramaUrl,
  pois,
  icons,
}: {
  vehicleId: string;
  panoramaUrl: string | null;
  pois: InteriorPoi[];
  icons: InteriorIconOption[];
}) {
  return (
    <div className="flex max-w-[1180px] flex-col gap-[26px]">
      <div>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">
          Imagen 360° y puntos de interés
        </h2>
        <p className="text-sm text-[var(--adm-muted)]">
          {panoramaUrl
            ? "Haz clic sobre la vista para colocar un punto. Arrastra para mirar alrededor."
            : "Carga la panorámica equirectangular del interior (proporción 2:1 exacta)."}
        </p>
      </div>

      {panoramaUrl ? (
        <PanoramaPoiEditor vehicleId={vehicleId} panoramaUrl={panoramaUrl} pois={pois} icons={icons} />
      ) : null}

      <PanoramaUploader vehicleId={vehicleId} panoramaUrl={panoramaUrl} />
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// Subida de la panorámica — el servidor valida 2:1 EXACTO (422 accionable)
// y deriva la variante mobile ≤4096px solo.
// ————————————————————————————————————————————————————————————————

function PanoramaUploader({ vehicleId, panoramaUrl }: { vehicleId: string; panoramaUrl: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const hasPanorama = panoramaUrl !== null;

  async function upload(file: File) {
    setError(null);
    setWarning(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch(`/api/admin/vehicles/${vehicleId}/interior-panorama`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo subir la panorámica");
      if (data.warning) setWarning(data.warning);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fallo al subir");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {hasPanorama ? (
        <div className="flex items-center gap-3">
          {/* Miniatura de la panorámica vigente — para ver de un vistazo QUÉ
              imagen hay cargada (una foto normal aquí delata el error). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={panoramaUrl}
            alt="Panorámica actual del interior"
            className="h-[54px] w-[108px] flex-none rounded-[10px] border border-[var(--adm-line)] object-cover"
          />
          <span className="text-xs text-[var(--adm-fainter)]">
            Panorámica actual (equirectangular completa, sin proyectar).
          </span>
        </div>
      ) : null}
      <label
        className={`flex cursor-pointer items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] px-6 hover:border-black hover:bg-white ${
          hasPanorama ? "h-[52px]" : "min-h-[180px] flex-col"
        }`}
      >
        <svg width={hasPanorama ? 18 : 26} height={hasPanorama ? 18 : 26} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        <span className="text-sm font-semibold">
          {uploading
            ? "Subiendo y procesando…"
            : hasPanorama
              ? "Reemplazar la panorámica"
              : "Cargar imagen 360° del interior"}
        </span>
        <span className="text-xs text-[var(--adm-faint)]">Equirectangular 2:1 exacta · mín. 4096 px de ancho</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </label>
      {error ? (
        <p role="alert" className="text-xs font-semibold text-[#b42318]">
          {error}
        </p>
      ) : null}
      {warning ? (
        <p role="status" className="text-xs font-semibold text-[#b54708]">
          {warning}
        </p>
      ) : null}
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// Editor sobre la panorámica.
// ————————————————————————————————————————————————————————————————

function editorMarkerHtml(title: string, selected: boolean, iconSize: number): string {
  const dot = Math.round(20 * (iconSize / 100));
  return `<div style="display:flex;align-items:center;gap:8px;pointer-events:none">
    <span style="width:${dot}px;height:${dot}px;border-radius:9999px;background:#fff;border:2px solid #000;flex:none"></span>
    <span style="font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:9999px;white-space:nowrap;background:${selected ? "#000" : "#fff"};color:${selected ? "#fff" : "#000"};border:1px solid #000">${escapeHtml(title)}</span>
  </div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function PanoramaPoiEditor({
  vehicleId,
  panoramaUrl,
  pois,
  icons,
}: {
  vehicleId: string;
  panoramaUrl: string;
  pois: InteriorPoi[];
  icons: InteriorIconOption[];
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<MarkersPlugin | null>(null);
  const panoSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [relocatingId, setRelocatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Los handlers de PSV se registran UNA vez; leen el estado vivo por ref
  // (mismo patrón que interior-panorama.tsx del showroom).
  const stateRef = useRef({ pois, relocatingId, selectedId });
  useEffect(() => {
    stateRef.current = { pois, relocatingId, selectedId };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let viewer: Viewer | null = null;
    let disposed = false;
    // Diferido un frame por la misma razón que interior-panorama.tsx: el
    // montaje fantasma de StrictMode (dev) creaba un viewer cuyo destroy()
    // abortaba la descarga compartida de la panorámica y el definitivo
    // quedaba en "Loading…" infinito.
    const raf = requestAnimationFrame(() => {
      if (disposed) return;
      viewer = new Viewer({
        container,
        panorama: panoramaUrl,
        navbar: false,
        defaultZoomLvl: 75,
        touchmoveTwoFingers: false,
        // Mismo adapter y misma opción que el visor público: la esfera se lee
        // por su relación 2:1, ignorando metadatos XMP de recorte.
        adapter: [EquirectangularAdapter, { useXmpData: false }],
        plugins: [[MarkersPlugin, { markers: [] }]],
      });

      let retried = false;
      viewer.addEventListener("panorama-error", () => {
        if (!retried && !disposed && viewer) {
          retried = true;
          viewer.setPanorama(panoramaUrl);
        }
      });

      const plugin = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);
      pluginRef.current = plugin ?? null;

      viewer.addEventListener("ready", () => {
        // Dimensiones reales de la textura — para normalizar (plan §1.5).
        const img = new Image();
        img.onload = () => {
          panoSizeRef.current = { width: img.naturalWidth, height: img.naturalHeight };
          syncMarkers(plugin, stateRef.current.pois, stateRef.current.selectedId, panoSizeRef.current);
        };
        img.src = panoramaUrl;
      });

      // Clic sobre la esfera: coloca un punto nuevo o recoloca el armado.
      viewer.addEventListener("click", ({ data }) => {
        if (data.rightclick) return;
        const size = panoSizeRef.current;
        // textureX/Y son undefined si el clic cae fuera de la esfera.
        if (!size || data.textureX === undefined || data.textureY === undefined) return;
        const textureX = data.textureX / size.width;
        const textureY = data.textureY / size.height;
        const { pois: current, relocatingId: moving } = stateRef.current;

        setError(null);
        startTransition(async () => {
          const base = moving ? current.find((p) => p.id === moving) : null;
          const fd = new FormData();
          if (base?.id) fd.set("id", base.id);
          fd.set("iconId", base?.iconId ?? icons[0]?.id ?? "");
          fd.set("title", base?.title ?? `Punto ${current.length + 1}`);
          fd.set("description", base?.description ?? "");
          fd.set("textureX", String(textureX));
          fd.set("textureY", String(textureY));
          fd.set("blink", base?.blink ?? "SOFT");
          fd.set("iconSize", String(base?.iconSize ?? 100));
          const result = await saveInteriorPoi(vehicleId, fd);
          if (!result.ok) setError(result.error);
          else {
            setRelocatingId(null);
            if (result.id) setSelectedId(result.id);
            router.refresh();
          }
        });
      });

      plugin?.addEventListener("select-marker", ({ marker }) => {
        setSelectedId(marker.id);
      });
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      pluginRef.current = null;
      viewer?.destroy();
    };
    // panoramaUrl es la única dependencia real: cambiarla recrea el viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panoramaUrl, vehicleId]);

  // Redibuja los markers cuando cambian los datos o la selección.
  useEffect(() => {
    const plugin = pluginRef.current;
    const size = panoSizeRef.current;
    if (plugin && size) syncMarkers(plugin, pois, selectedId, size);
  }, [pois, selectedId]);

  return (
    <div className="grid items-start gap-[22px] lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-2">
        <div
          ref={containerRef}
          className={`aspect-video w-full overflow-hidden rounded-[18px] border ${
            relocatingId ? "border-black" : "border-[var(--adm-line)]"
          }`}
          style={{ cursor: "crosshair" }}
        />
        <p className="text-[12.5px] text-[var(--adm-fainter)]">
          {relocatingId
            ? "Modo recolocar: el próximo clic mueve el punto seleccionado."
            : "Un clic coloca un punto nuevo en esa posición exacta de la esfera."}
        </p>
        {error ? (
          <p role="alert" className="text-xs font-semibold text-[#b42318]">
            {error}
          </p>
        ) : null}
      </div>

      {/* Lista lateral — 1:1 con el aside del prototipo */}
      <aside className="flex flex-col gap-4 rounded-[18px] border border-[var(--adm-line)] p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Puntos de interés</span>
          <span className="text-xs text-[var(--adm-fainter)]">
            {pois.length} {pois.length === 1 ? "punto" : "puntos"}
          </span>
        </div>

        {pois.length === 0 ? (
          <p className="text-[12.5px] text-[var(--adm-faint)]">
            Todavía no hay puntos — haz clic sobre la panorámica para crear el primero.
          </p>
        ) : (
          pois.map((poi) => (
            <PoiRow
              key={poi.id}
              vehicleId={vehicleId}
              poi={poi}
              icons={icons}
              isSelected={poi.id === selectedId}
              isRelocating={poi.id === relocatingId}
              disabled={isPending}
              onSelect={() => setSelectedId(poi.id)}
              onRelocate={() => setRelocatingId((prev) => (prev === poi.id ? null : poi.id))}
            />
          ))
        )}
      </aside>
    </div>
  );
}

function syncMarkers(
  plugin: MarkersPlugin,
  pois: InteriorPoi[],
  selectedId: string | null,
  size: { width: number; height: number },
) {
  try {
    plugin.setMarkers(
      pois
        .filter((p) => p.textureX !== null && p.textureY !== null)
        .map((poi) => ({
          id: poi.id,
          position: {
            textureX: Math.round((poi.textureX as number) * size.width),
            textureY: Math.round((poi.textureY as number) * size.height),
          },
          html: editorMarkerHtml(poi.title, poi.id === selectedId, poi.iconSize),
          size: { width: Math.round(220 * (poi.iconSize / 100)), height: Math.round(30 * (poi.iconSize / 100)) },
          anchor: "center left",
        })),
    );
  } catch {
    // setMarkers puede correr antes de que la panorámica termine de cargar;
    // el efecto volverá a sincronizar en el siguiente cambio.
  }
}

function PoiRow({
  vehicleId,
  poi,
  icons,
  isSelected,
  isRelocating,
  disabled,
  onSelect,
  onRelocate,
}: {
  vehicleId: string;
  poi: InteriorPoi;
  icons: InteriorIconOption[];
  isSelected: boolean;
  isRelocating: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRelocate: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [iconSize, setIconSize] = useState(poi.iconSize);
  const [imagePreview, setImagePreview] = useState<string | null>(poi.imageUrl);

  function save(
    patch: Partial<Pick<InteriorPoi, "title" | "iconId" | "blink" | "description" | "iconSize">> & {
      image?: File;
    },
  ) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", poi.id);
      fd.set("iconId", patch.iconId ?? poi.iconId);
      fd.set("title", patch.title ?? poi.title);
      fd.set("description", patch.description ?? poi.description);
      fd.set("textureX", String(poi.textureX ?? 0.5));
      fd.set("textureY", String(poi.textureY ?? 0.5));
      fd.set("blink", patch.blink ?? poi.blink);
      fd.set("iconSize", String(patch.iconSize ?? iconSize));
      if (patch.image) fd.set("image", patch.image);
      await saveInteriorPoi(vehicleId, fd);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      await deletePoi(vehicleId, poi.id);
      router.refresh();
    });
  }

  const busy = disabled || isPending;

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-[13px] border p-3 ${
        isSelected ? "border-black" : "border-[var(--adm-line)]"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <label
          className="relative flex h-9 w-9 flex-none cursor-pointer items-center justify-center overflow-hidden rounded-[9px] border border-[var(--adm-line)] bg-[var(--adm-surface)] hover:border-black"
          onClick={(e) => e.stopPropagation()}
        >
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6" />
            </svg>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImagePreview(URL.createObjectURL(file));
              save({ image: file });
              e.target.value = "";
            }}
          />
        </label>
        <input
          defaultValue={poi.title}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== poi.title) save({ title: e.target.value });
          }}
          className="h-9 w-full min-w-0 rounded-[9px] border border-transparent bg-transparent px-2 text-[13px] font-semibold hover:border-[var(--adm-border-input)] focus:border-black"
        />
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          aria-label={`Eliminar ${poi.title}`}
          className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-full border border-[var(--adm-line)] bg-white hover:border-black disabled:opacity-40"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <textarea
        defaultValue={poi.description}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          if (e.target.value !== poi.description) save({ description: e.target.value });
        }}
        rows={2}
        placeholder="Describe el punto en una o dos líneas."
        className="resize-y rounded-[9px] border border-transparent bg-transparent px-2 py-1.5 text-[12.5px] leading-[1.5] hover:border-[var(--adm-border-input)] focus:border-black"
      />

      <div className="flex flex-wrap gap-1.5">
        {icons.map((icon) => (
          <button
            key={icon.id}
            type="button"
            disabled={busy}
            title={icon.label}
            onClick={() => save({ iconId: icon.id })}
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border p-1.5 ${
              icon.id === poi.iconId
                ? "border-black bg-black"
                : "border-[var(--adm-line)] bg-white hover:border-black"
            }`}
          >
            <HotspotIconImage icon={icon} size={18} />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {(Object.keys(BLINK_LABELS) as InteriorPoi["blink"][]).map((blink) => (
          <button
            key={blink}
            type="button"
            disabled={busy}
            onClick={() => save({ blink })}
            className={`h-8 flex-1 cursor-pointer rounded-full border text-[11px] font-semibold ${
              poi.blink === blink
                ? "border-black bg-black text-white"
                : "border-[var(--adm-border-input)] bg-white text-black hover:border-black"
            }`}
          >
            {BLINK_LABELS[blink]}
          </button>
        ))}
      </div>

      <div
        className="flex items-center gap-2 rounded-full border border-[var(--adm-line)] px-3 py-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#6b6b6b]">Tamaño</span>
        <input
          type="range"
          min={50}
          max={200}
          value={iconSize}
          disabled={busy}
          onChange={(e) => setIconSize(Number(e.target.value))}
          onPointerUp={() => save({ iconSize })}
          className="h-1 flex-1 accent-black"
        />
        <span className="min-w-[34px] text-right text-[11.5px] font-bold">{iconSize}%</span>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onRelocate();
        }}
        className={`h-8 cursor-pointer rounded-full border text-[11.5px] font-semibold ${
          isRelocating
            ? "border-black bg-black text-white"
            : "border-[var(--adm-border-input)] bg-white hover:border-black"
        }`}
      >
        {isRelocating ? "Haz clic en la vista para moverlo…" : "Recolocar"}
      </button>
    </div>
  );
}
