"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveExteriorPoi, deletePoi } from "../poi-actions";
import { HotspotIconImage } from "./catalog-icon";

// Paso 4 — Destacados del exterior (prototipo "Destacados" + artefacto Req 5),
// MÁS el campo que el prototipo no tenía: el fotograma (1–36) al que rota el
// vehículo al abrir el punto — con vista previa REAL sobre el sprite LOW ya
// procesado (§0.2: por esto el paso 3 va antes).

export type FeatureIconOption = {
  id: string;
  key: string;
  label: string;
  svgPath: string;
  assetName: string | null;
};

export type ExteriorPoi = {
  id: string;
  iconId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  frame: number;
};

export function Step4Features({
  vehicleId,
  pois,
  icons,
  /** Base LOW del primer color procesado — null si aún no hay galería. */
  framePreviewBase,
}: {
  vehicleId: string;
  pois: ExteriorPoi[];
  icons: FeatureIconOption[];
  framePreviewBase: string | null;
}) {
  const [draftOpen, setDraftOpen] = useState(false);

  return (
    <div className="flex max-w-[1080px] flex-col gap-[30px]">
      <div>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">Destacados del exterior</h2>
        <p className="text-sm text-[var(--adm-muted)]">
          Imagen, título y descripción de cada atributo. El fotograma elegido es al que rota
          el vehículo al abrir el punto en el showroom.
        </p>
        {!framePreviewBase ? (
          <p className="mt-2 text-[12.5px] font-semibold text-[#b45309]">
            Aún no hay una galería procesada (paso 3) — el selector de fotograma funcionará a
            ciegas hasta entonces.
          </p>
        ) : null}
      </div>

      <div className="grid gap-[18px] lg:grid-cols-2">
        {pois.map((poi) => (
          <FeatureCard
            key={poi.id}
            vehicleId={vehicleId}
            poi={poi}
            icons={icons}
            framePreviewBase={framePreviewBase}
            onDone={() => undefined}
          />
        ))}

        {draftOpen ? (
          <FeatureCard
            vehicleId={vehicleId}
            poi={null}
            icons={icons}
            framePreviewBase={framePreviewBase}
            onDone={() => setDraftOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setDraftOpen(true)}
            className="flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] text-black hover:border-black hover:bg-white"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="text-sm font-semibold">Añadir destacado</span>
            <span className="text-xs text-[var(--adm-faint)]">Imagen + título + descripción + fotograma</span>
          </button>
        )}
      </div>
    </div>
  );
}

function FeatureCard({
  vehicleId,
  poi,
  icons,
  framePreviewBase,
  onDone,
}: {
  vehicleId: string;
  poi: ExteriorPoi | null;
  icons: FeatureIconOption[];
  framePreviewBase: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [frame, setFrame] = useState(poi?.frame ?? 1);
  const [iconId, setIconId] = useState(poi?.iconId ?? icons[0]?.id ?? "");
  const [imagePreview, setImagePreview] = useState<string | null>(poi?.imageUrl ?? null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    formData.set("iconId", iconId);
    formData.set("frame", String(frame));
    if (poi) formData.set("id", poi.id);
    startTransition(async () => {
      const result = await saveExteriorPoi(vehicleId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      onDone();
      router.refresh();
    });
  }

  function remove() {
    if (!poi) return;
    startTransition(async () => {
      const result = await deletePoi(vehicleId, poi.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const inputClass =
    "rounded-[11px] border border-[var(--adm-border-input)] bg-white px-3.5 text-[14px]";

  return (
    <form
      ref={formRef}
      action={submit}
      className="flex flex-col overflow-hidden rounded-[18px] border border-[var(--adm-line)]"
    >
      {/* Imagen del panel de detalle */}
      <label className="relative flex aspect-video cursor-pointer items-center justify-center border-b border-[var(--adm-line)] bg-[var(--adm-surface)]">
        {imagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePreview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-[var(--adm-fainter)]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <path d="M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6" />
            </svg>
            <span className="text-xs tracking-[0.04em]">Añadir imagen (opcional)</span>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-black px-2.5 py-[5px] text-[11px] font-bold tracking-[0.08em] text-white">
          EXTERIOR
        </span>
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setImagePreview(URL.createObjectURL(file));
          }}
        />
      </label>

      <div className="flex flex-col gap-3 p-[18px]">
        <input
          name="title"
          defaultValue={poi?.title ?? ""}
          placeholder="Título — ej. Firma luminosa LED"
          className={`${inputClass} h-11 font-semibold`}
        />
        <textarea
          name="description"
          defaultValue={poi?.description ?? ""}
          rows={3}
          placeholder="Describe el atributo en una o dos líneas."
          className={`${inputClass} resize-y py-3 text-[13.5px] leading-[1.55]`}
        />

        {/* Ícono vinculado */}
        <div className="flex flex-wrap gap-1.5">
          {icons.map((icon) => (
            <button
              key={icon.id}
              type="button"
              onClick={() => setIconId(icon.id)}
              title={icon.label}
              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border p-1.5 ${
                icon.id === iconId
                  ? "border-black bg-black"
                  : "border-[var(--adm-line)] bg-white hover:border-black"
              }`}
            >
              <HotspotIconImage icon={icon} size={20} />
            </button>
          ))}
        </div>

        {/* Fotograma con vista previa real */}
        <div className="flex items-center gap-3 rounded-full border border-[var(--adm-line)] px-4 py-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6b6b6b]">
            Fotograma
          </span>
          <input
            type="range"
            min={1}
            max={36}
            value={frame}
            onChange={(e) => setFrame(Number(e.target.value))}
            className="h-1 flex-1 accent-black"
          />
          <span className="min-w-[52px] text-right text-[13px] font-bold">{frame} / 36</span>
        </div>
        {framePreviewBase ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${framePreviewBase}/${String(frame).padStart(4, "0")}.webp`}
            alt={`Fotograma ${frame}`}
            className="h-[120px] w-full rounded-[10px] border border-[var(--adm-line)] bg-white object-contain"
          />
        ) : null}

        {error ? (
          <p role="alert" className="text-xs font-semibold text-[#b42318]">
            {error}
          </p>
        ) : null}
        {saved ? <p className="text-xs font-semibold text-[#067647]">Guardado.</p> : null}

        <div className="flex items-center justify-between border-t border-[var(--adm-line-soft)] pt-3">
          {poi ? (
            confirmingDelete ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={remove}
                  className="h-8 cursor-pointer rounded-full border border-[#b42318] bg-white px-3.5 text-xs font-semibold text-[#b42318]"
                >
                  Sí, eliminar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="h-8 cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3.5 text-xs font-semibold hover:border-black"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="h-8 cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3.5 text-xs font-semibold hover:border-black"
              >
                Eliminar
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onDone}
              className="h-8 cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3.5 text-xs font-semibold hover:border-black"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="h-9 cursor-pointer rounded-full bg-black px-5 text-xs font-semibold text-white transition-colors hover:bg-[var(--adm-hover)] disabled:opacity-60"
          >
            {isPending ? "Guardando…" : poi ? "Guardar cambios" : "Crear destacado"}
          </button>
        </div>
      </div>
    </form>
  );
}
