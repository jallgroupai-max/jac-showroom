"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createHotspotIcon, updateHotspotIcon } from "@/lib/admin/api";
import { HotspotIconImage } from "../vehiculos/wizard/catalog-icon";

type IconGroup = "EXTERIOR" | "INTERIOR" | "GENERAL";

type ExistingIcon = {
  id: string;
  label: string;
  group: IconGroup | string;
  iconUrl: string | null;
  assetName: string | null;
  svgPath: string;
};

const GROUP_LABELS: Record<IconGroup, string> = {
  EXTERIOR: "Exterior",
  INTERIOR: "Interior",
  GENERAL: "General",
};

// Un solo modal para alta y edición, mismo criterio que CategoryModal: los
// campos coinciden y así el de edición no se queda atrás cuando cambie el de
// alta. La diferencia real está en el origen del dibujo — al crear se elige
// entre subir un SVG o tomar uno de la biblioteca del proyecto; al editar solo
// se puede subir (el asset de un ícono ya dado de alta no se reasigna: su key
// y sus usos ya dependen de él).
export function IconModal(
  props:
    | { mode: "create"; availableAssets: string[] }
    | { mode: "edit"; icon: ExistingIcon },
) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const icon = isEdit ? props.icon : null;
  const availableAssets = props.mode === "create" ? props.availableAssets : [];

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState(icon?.label ?? "");
  const [group, setGroup] = useState<IconGroup>((icon?.group as IconGroup) ?? "EXTERIOR");
  // Con biblioteca disponible se arranca en ella: es la vía más rápida y no
  // exige que el admin tenga un archivo a mano.
  const [source, setSource] = useState<"library" | "upload">(
    availableAssets.length > 0 ? "library" : "upload",
  );
  const [assetName, setAssetName] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
    setFileName(null);
    setAssetName(null);
    setRemoveIcon(false);
    setLabel(icon?.label ?? "");
    setGroup((icon?.group as IconGroup) ?? "EXTERIOR");
    setSource(availableAssets.length > 0 ? "library" : "upload");
  }

  function submit(formData: FormData) {
    setError(null);
    formData.set("group", group);
    if (!isEdit) {
      formData.set("source", source);
      if (source === "library") {
        if (!assetName) {
          setError("Elige un ícono de la biblioteca.");
          return;
        }
        formData.set("assetName", assetName);
        formData.delete("file");
      }
    }
    if (removeIcon) formData.set("removeIcon", "true");

    startTransition(async () => {
      const result = icon
        ? await updateHotspotIcon(icon.id, formData)
        : await createHotspotIcon(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  // El SVG propio vigente solo se muestra mientras no se haya pedido quitarlo
  // ni elegido un reemplazo — el modal refleja lo que se va a guardar.
  const showsCurrentUpload = Boolean(icon?.iconUrl) && !removeIcon && fileName === null;

  const pill = (isActive: boolean) =>
    `h-9 flex-1 cursor-pointer rounded-full border text-xs font-semibold ${
      isActive
        ? "border-black bg-black text-white"
        : "border-[var(--adm-border-input)] bg-white text-black"
    }`;

  return (
    <>
      {isEdit ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-[30px] flex-1 cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3 text-xs font-semibold transition-colors hover:border-black"
        >
          Editar
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-[42px] cursor-pointer items-center gap-[9px] rounded-full border border-black bg-white px-5 text-[13px] font-semibold text-black transition-colors hover:bg-black hover:text-white"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo ícono
        </button>
      )}

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-8">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="absolute inset-0 cursor-default border-none bg-black/40"
          />
          <form
            action={submit}
            className="relative flex max-h-full w-full max-w-[560px] flex-col gap-5 overflow-y-auto rounded-[20px] border border-black bg-white p-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.22)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[19px] font-bold tracking-[-0.02em]">
                  {isEdit ? "Editar ícono" : "Nuevo ícono"}
                </div>
                <div className="mt-[5px] text-[12.5px] text-[var(--adm-faint)]">
                  Quedará disponible en el paso del wizard que corresponda a su grupo.
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar"
                className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-full border border-[var(--adm-line)] bg-white hover:border-black"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
                Nombre
              </span>
              <input
                name="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ej. Techo panorámico"
                className="h-[46px] rounded-[12px] border border-[var(--adm-border-input)] bg-white px-3.5 text-sm"
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
                Grupo
              </span>
              <div className="flex gap-2">
                {(Object.keys(GROUP_LABELS) as IconGroup[]).map((g) => (
                  <button key={g} type="button" onClick={() => setGroup(g)} className={pill(group === g)}>
                    {GROUP_LABELS[g]}
                  </button>
                ))}
              </div>
              <span className="text-xs text-[var(--adm-fainter)]">
                Exterior y Interior alimentan los puntos de interés; General, los chips de
                combustible y tracción de la card.
              </span>
            </div>

            {!isEdit && availableAssets.length > 0 ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => setSource("library")} className={pill(source === "library")}>
                  Biblioteca del proyecto
                </button>
                <button type="button" onClick={() => setSource("upload")} className={pill(source === "upload")}>
                  Subir SVG
                </button>
              </div>
            ) : null}

            {!isEdit && source === "library" && availableAssets.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="grid max-h-[220px] gap-1.5 overflow-y-auto rounded-[14px] border border-[var(--adm-line)] p-2 [grid-template-columns:repeat(auto-fill,minmax(56px,1fr))]">
                  {availableAssets.map((name) => (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      onClick={() => {
                        setAssetName(name);
                        // El nombre del archivo es un punto de partida decente
                        // para la etiqueta; el admin la corrige si hace falta.
                        if (label.trim().length === 0) setLabel(name.replace(/[-_]+/g, " "));
                      }}
                      className={`flex aspect-square cursor-pointer items-center justify-center rounded-[10px] border p-2 ${
                        assetName === name
                          ? "border-black bg-black/5"
                          : "border-[var(--adm-line)] bg-white hover:border-black"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/assets/icons/${name}.svg`} alt={name} className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
                <span className="text-xs text-[var(--adm-fainter)]">
                  {availableAssets.length} íconos de diseño que ya están en el proyecto y todavía no
                  se ofrecen en el wizard.
                </span>
              </div>
            ) : null}

            {isEdit || source === "upload" ? (
              <div className="flex flex-col gap-2">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
                  {isEdit ? "Reemplazar dibujo" : "Archivo SVG"}
                </span>
                <div className="flex items-center gap-3">
                  {icon ? (
                    <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-surface-soft)] p-2.5">
                      <HotspotIconImage
                        icon={{
                          label: icon.label,
                          svgPath: icon.svgPath,
                          assetName: icon.assetName,
                          iconUrl: removeIcon ? null : icon.iconUrl,
                        }}
                        size={28}
                      />
                    </span>
                  ) : null}

                  <label className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2.5 rounded-[12px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] px-4 hover:border-black hover:bg-white">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round">
                      <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                    </svg>
                    <span className="truncate text-[13px] font-semibold">
                      {fileName ?? (icon?.iconUrl ? "Reemplazar SVG" : "Cargar SVG")}
                    </span>
                    <input
                      type="file"
                      name="file"
                      accept="image/svg+xml,.svg"
                      className="hidden"
                      onChange={(e) => {
                        setFileName(e.target.files?.[0]?.name ?? null);
                        setRemoveIcon(false);
                      }}
                    />
                  </label>

                  {showsCurrentUpload ? (
                    <button
                      type="button"
                      onClick={() => setRemoveIcon(true)}
                      className="h-11 flex-none cursor-pointer rounded-[12px] border border-[var(--adm-border-input)] bg-white px-4 text-[13px] font-semibold hover:border-black"
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
                <span className="text-xs text-[var(--adm-fainter)]">
                  {removeIcon
                    ? icon?.assetName
                      ? `Al guardar volverá al ícono original del proyecto (${icon.assetName}).`
                      : "Al guardar volverá al dibujo de respaldo."
                    : "Máx. 64 KB. Se usa tanto en el panel como en el showroom público."}
                </span>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="text-xs font-semibold text-[#b42318]">
                {error}
              </p>
            ) : null}

            <div className="mt-0.5 flex items-center justify-end gap-2.5 border-t border-[var(--adm-line-soft)] pt-4">
              <button
                type="button"
                onClick={close}
                className="h-[42px] cursor-pointer rounded-full border border-[var(--adm-border-input)] bg-white px-5 text-[13px] font-semibold hover:border-black"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="h-[42px] cursor-pointer rounded-full bg-black px-[22px] text-[13px] font-semibold text-white transition-colors hover:bg-[var(--adm-hover)] disabled:opacity-60"
              >
                {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear ícono"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
