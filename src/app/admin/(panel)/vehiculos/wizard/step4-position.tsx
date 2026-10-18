"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveVehicleViewerPositions } from "@/lib/admin/api";
import type { ViewerPositionsPatch } from "@/lib/admin/api-types";
import { SceneBackground } from "@/components/showroom/scene-background";
import {
  DEFAULT_VIEWER_POSITION,
  VIEWER_LIMITS,
  VIEWER_PRESETS,
  VIEWER_PRESET_INFO,
  clampViewerPosition,
  viewerLayerProps,
  type ViewerPosition,
  type ViewerPositions,
  type ViewerPreset,
} from "@/lib/viewer-position";

// Paso 4 — Posición en móvil. El admin define dónde se apoya el vehículo 360°
// exterior en el héroe del showroom para cada preset de pantalla (< 1024px,
// vertical). La preview usa la MISMA fórmula que el visor real
// (viewerLayerProps) sobre el sprite real y el fondo claro, dentro de un
// marco con las medidas de referencia del preset. Sin fila para un preset el
// showroom usa el encuadre por defecto del código.

const LIGHT_BACKGROUND = "/assets/backgrounds/light.jpeg";

// Alto del héroe en el showroom real por preset (px de CSS), medido en vista
// de visualizador con Chrome: el héroe es lo que sobra del viewport tras el
// header y los controles de abajo (carrusel de colores, escena, CTA). Si el
// vehículo tiene destacados de exterior, la toolbar de destacados le quita
// ~52px más. Si cambia el layout del showroom móvil, re-medir aquí.
const HEADER_HEIGHT = 57;
const HERO_HEIGHT: Record<ViewerPreset, { base: number; withPois: number }> = {
  PHONE_SMALL: { base: 22, withPois: 0 },
  PHONE_STANDARD: { base: 138, withPois: 86 },
  PHONE_TALL: { base: 313, withPois: 261 },
  TABLET: { base: 564, withPois: 512 },
};

// En PHONE_SMALL (375×548) el showroom actual deja al héroe casi sin alto
// (0–22px): ahí no hay encuadre que ver. La preview usa este alto mínimo para
// poder trabajar y lo avisa en pantalla.
const MIN_PREVIEW_HERO_HEIGHT = 120;

// Caja máxima (px de pantalla) donde cabe el marco del teléfono; el viewport
// de referencia se escala para entrar, conservando proporciones.
const PREVIEW_MAX_W = 340;
const PREVIEW_MAX_H = 600;

type PresetState = { position: ViewerPosition; custom: boolean };
type EditorState = Record<ViewerPreset, PresetState>;

function initialState(saved: ViewerPositions): EditorState {
  return Object.fromEntries(
    VIEWER_PRESETS.map((preset) => {
      const row = saved[preset];
      return [preset, { position: row ?? DEFAULT_VIEWER_POSITION, custom: row !== undefined }];
    }),
  ) as EditorState;
}

const samePosition = (a: ViewerPosition, b: ViewerPosition) =>
  a.offsetX === b.offsetX && a.offsetY === b.offsetY && a.scale === b.scale;

/** Diferencias entre lo editado y lo guardado, en el formato del endpoint. */
function buildPatch(state: EditorState, saved: ViewerPositions): ViewerPositionsPatch {
  const patch: ViewerPositionsPatch = {};
  for (const preset of VIEWER_PRESETS) {
    const { position, custom } = state[preset];
    const row = saved[preset];
    if (custom) {
      if (!row || !samePosition(row, position)) patch[preset] = position;
    } else if (row) {
      patch[preset] = null;
    }
  }
  return patch;
}

export function Step4Position({
  vehicleId,
  spriteBase,
  hasPois,
  saved: initialSaved,
}: {
  vehicleId: string;
  /** Base del sprite del primer color procesado (…/{quality}/0001.webp) —
   * null si ninguno tiene galería procesada: el paso queda deshabilitado. */
  spriteBase: string | null;
  /** El vehículo tiene destacados de exterior (la toolbar le quita alto al héroe). */
  hasPois: boolean;
  saved: ViewerPositions;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<ViewerPositions>(initialSaved);
  const [state, setState] = useState<EditorState>(() => initialState(initialSaved));
  const [preset, setPreset] = useState<ViewerPreset>("PHONE_STANDARD");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const patch = buildPatch(state, saved);
  const dirty = Object.keys(patch).length > 0;
  const current = state[preset];

  function update(next: Partial<ViewerPosition>) {
    setNotice(null);
    setState((s) => ({
      ...s,
      [preset]: { position: clampViewerPosition({ ...s[preset].position, ...next }), custom: true },
    }));
  }

  function reset() {
    setNotice(null);
    setState((s) => ({ ...s, [preset]: { position: DEFAULT_VIEWER_POSITION, custom: false } }));
  }

  function copyToOthers() {
    setNotice("Copiado a las demás pantallas. Pulsa Guardar para aplicarlo.");
    setState((s) =>
      Object.fromEntries(VIEWER_PRESETS.map((p) => [p, { ...s[preset] }])) as EditorState,
    );
  }

  function save() {
    setError(null);
    setNotice(null);
    const sent = patch;
    startTransition(async () => {
      const result = await saveVehicleViewerPositions(vehicleId, sent);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const next = { ...saved };
      for (const p of VIEWER_PRESETS) {
        const value = sent[p];
        if (value === undefined) continue;
        if (value === null) delete next[p];
        else next[p] = value;
      }
      setSaved(next);
      setNotice("Posiciones guardadas.");
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-[1180px] flex-col gap-7">
      <div>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">Posición en móvil</h2>
        <p className="text-sm text-[var(--adm-muted)]">
          Ajusta dónde se apoya el vehículo 360° en cada tamaño de pantalla. Sin ajuste, el
          showroom usa el encuadre por defecto. En escritorio y en horizontal no cambia nada.
        </p>
      </div>

      {!spriteBase ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] px-6 text-center">
          <span className="text-sm font-semibold">Este paso necesita una galería 360° procesada</span>
          <span className="text-xs text-[var(--adm-faint)]">
            Carga y procesa al menos un color en el paso 3; la preview usa ese sprite.
          </span>
          <Link
            href={`/admin/vehiculos/${vehicleId}?paso=3`}
            className="mt-1 flex h-10 items-center rounded-full border border-[var(--adm-border-input)] bg-white px-5 text-[13px] font-semibold text-black no-underline hover:border-black"
          >
            Ir a la galería
          </Link>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Pantalla de referencia" className="flex flex-wrap gap-2.5">
            {VIEWER_PRESETS.map((p) => {
              const info = VIEWER_PRESET_INFO[p];
              const isActive = p === preset;
              const edited = state[p].custom;
              return (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setPreset(p)}
                  className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-[13px] border px-4 py-2.5 text-left ${
                    isActive
                      ? "border-black bg-black text-white"
                      : "border-[var(--adm-border-input)] bg-white text-black hover:border-black"
                  }`}
                >
                  <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                    {info.label}
                    {edited ? (
                      <span
                        aria-label="Con ajuste propio"
                        className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-white" : "bg-black"}`}
                      />
                    ) : null}
                  </span>
                  <span className={`text-[11.5px] ${isActive ? "text-white/65" : "text-[var(--adm-fainter)]"}`}>
                    {info.width}×{info.height} · {info.device}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid items-start gap-[26px] lg:grid-cols-[1fr_372px]">
            <PhonePreview
              preset={preset}
              hasPois={hasPois}
              spriteBase={spriteBase}
              position={current.position}
              onChange={update}
            />

            <aside className="flex flex-col gap-[18px] rounded-[18px] border border-[var(--adm-line)] p-[22px]">
              <div>
                <div className="text-[15px] font-bold tracking-[-0.01em]">
                  {VIEWER_PRESET_INFO[preset].label}
                </div>
                <div className="mt-1 text-[12.5px] text-[var(--adm-faint)]">
                  {current.custom
                    ? "Con ajuste propio."
                    : "Usa el encuadre por defecto. Mueve cualquier control para personalizarlo."}
                </div>
              </div>

              <Control
                label="Horizontal"
                hint="Izquierda ← → derecha"
                unit="%"
                factor={100}
                limits={VIEWER_LIMITS.offsetX}
                value={current.position.offsetX}
                onChange={(v) => update({ offsetX: v })}
              />
              <Control
                label="Vertical"
                hint="Altura de la línea de piso"
                unit="%"
                factor={100}
                limits={VIEWER_LIMITS.offsetY}
                value={current.position.offsetY}
                onChange={(v) => update({ offsetY: v })}
              />
              <Control
                label="Tamaño"
                hint="Escala desde la base"
                unit="×"
                factor={1}
                limits={VIEWER_LIMITS.scale}
                value={current.position.scale}
                onChange={(v) => update({ scale: v })}
              />

              <div className="h-px bg-[var(--adm-line-soft)]" />

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={reset}
                  disabled={!current.custom}
                  className="h-10 cursor-pointer rounded-full border border-[var(--adm-border-input)] bg-white px-4 text-[13px] font-semibold text-black hover:border-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--adm-border-input)]"
                >
                  Restablecer
                </button>
                <button
                  type="button"
                  onClick={copyToOthers}
                  className="h-10 cursor-pointer rounded-full border border-[var(--adm-border-input)] bg-white px-4 text-[13px] font-semibold text-black hover:border-black"
                >
                  Copiar a los demás presets
                </button>
              </div>

              <button
                type="button"
                onClick={save}
                disabled={!dirty || isPending}
                className="h-11 cursor-pointer rounded-full border border-black bg-black px-6 text-[13.5px] font-semibold text-white hover:bg-[var(--adm-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? "Guardando…" : dirty ? "Guardar posiciones" : "Sin cambios por guardar"}
              </button>

              {error ? (
                <p role="alert" className="text-xs font-semibold text-[#b42318]">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p role="status" className="text-xs font-semibold text-[var(--adm-ink-soft)]">
                  {notice}
                </p>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

// Marco de teléfono con el viewport de referencia del preset, escalado para
// caber. Dentro replica la estructura del showroom móvil: header, héroe (lo
// que sobra) con el fondo claro + capa del vehículo, y la zona de controles.
// El héroe se arrastra con el puntero para mover el vehículo.
function PhonePreview({
  preset,
  hasPois,
  spriteBase,
  position,
  onChange,
}: {
  preset: ViewerPreset;
  hasPois: boolean;
  spriteBase: string;
  position: ViewerPosition;
  onChange: (next: Partial<ViewerPosition>) => void;
}) {
  const { width, height } = VIEWER_PRESET_INFO[preset];
  const zoom = Math.min(PREVIEW_MAX_W / width, PREVIEW_MAX_H / height, 1);
  const measuredHero = hasPois ? HERO_HEIGHT[preset].withPois : HERO_HEIGHT[preset].base;
  const heroHeight = Math.max(measuredHero, MIN_PREVIEW_HERO_HEIGHT);
  const layer = viewerLayerProps(position, true);

  // Arrastre: el delta en pantalla se convierte a fracción del héroe real
  // (dividiendo por el zoom de la preview).
  const drag = useRef<{ x: number; y: number; start: ViewerPosition } | null>(null);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-[38px] bg-black p-2.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)]">
        <div
          className="relative overflow-hidden rounded-[28px] bg-[#F4F6F9]"
          style={{ width: width * zoom, height: height * zoom }}
        >
          <div
            className="absolute left-0 top-0 flex origin-top-left flex-col"
            style={{ width, height, transform: `scale(${zoom})` }}
          >
            <div
              className="flex shrink-0 items-center justify-center text-[13px] font-semibold text-[#8a8a8a]"
              style={{ height: HEADER_HEIGHT }}
              aria-hidden
            >
              Encabezado
            </div>

            <div
              role="img"
              aria-label="Vista previa del vehículo en el visor"
              className="relative shrink-0 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
              style={{ height: heroHeight }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, start: position };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                onChange({
                  offsetX: d.start.offsetX + (e.clientX - d.x) / (width * zoom),
                  offsetY: d.start.offsetY - (e.clientY - d.y) / (heroHeight * zoom),
                });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <div className="absolute inset-0">
                <SceneBackground imageUrl={LIGHT_BACKGROUND} />
                <div
                  className={`absolute inset-x-0 top-0 flex items-end justify-center ${layer.floor.className}`}
                  style={layer.floor.style}
                >
                  <div
                    className={`flex h-full w-full items-end justify-center ${layer.inner.className}`}
                    style={layer.inner.style}
                  >
                    <div className={`pointer-events-none relative drop-shadow-2xl ${layer.sprite.className}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- sprite servido directo, igual que el visor */}
                      <img
                        src={`${spriteBase}/low/0001.webp`}
                        alt=""
                        draggable={false}
                        className="h-full w-auto max-w-full object-contain"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 px-4 pb-3" aria-hidden>
              <div className="h-9 rounded-full bg-black/10" />
              <div className="h-9 rounded-full bg-black/10" />
              <div className="h-11 rounded-full bg-black/80" />
            </div>
          </div>
        </div>
      </div>
      <p className="max-w-[340px] text-center text-[11.5px] text-[var(--adm-fainter)]">
        Vista previa de {width}×{height} px. Arrastra el vehículo o usa los controles.
        {measuredHero < MIN_PREVIEW_HERO_HEIGHT
          ? ` En este tamaño el visor real queda con ${Math.round(measuredHero)} px de alto; la preview usa ${MIN_PREVIEW_HERO_HEIGHT} px para poder ajustar.`
          : ""}
      </p>
    </div>
  );
}

// Slider + input numérico sobre el mismo valor. El input muestra el valor
// formateado (en % para los desplazamientos); mientras se escribe guarda el
// texto en `draft` y solo confirma cuando es un número válido.
function Control({
  label,
  hint,
  unit,
  factor,
  limits,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  unit: string;
  /** Multiplicador valor interno → valor mostrado (100 para fracciones en %). */
  factor: number;
  limits: { min: number; max: number; step: number };
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = String(Number((value * factor).toFixed(2)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold">{label}</span>
          <span className="text-[11.5px] text-[var(--adm-fainter)]">{hint}</span>
        </label>
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            aria-label={`${label} (${unit})`}
            min={limits.min * factor}
            max={limits.max * factor}
            step={limits.step * factor}
            value={draft ?? shown}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) onChange(n / factor);
            }}
            onBlur={() => setDraft(null)}
            className="h-9 w-[84px] rounded-[11px] border border-[var(--adm-border-input)] bg-white px-2.5 text-right text-[13.5px] font-semibold"
          />
          <span className="w-3 text-[12px] text-[var(--adm-faint)]">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="w-full cursor-pointer accent-black"
      />
    </div>
  );
}
