"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { vehicleBasicsSchema, type VehicleBasicsInput } from "@/lib/admin/schemas";
import { slugify } from "@/lib/admin/slug";
import { createVehicle, updateVehicleBasics, saveVehicleCardImage, removeVehicleCardImage } from "@/lib/admin/api";
import { CatalogIcon, CATEGORY_ICON_PATHS, FALLBACK_CATEGORY_PATH, HotspotIconImage } from "./catalog-icon";

type CategoryOption = { id: string; slug: string; name: string; vehicleCount: number };
type GeneralIconOption = { id: string; key: string; label: string; svgPath: string; assetName: string | null };

export function Step1Form({
  categories,
  generalIcons,
  vehicleId,
  cardImageUrl,
  defaults,
}: {
  categories: CategoryOption[];
  /** Solo grupo GENERAL (combustible/tracción) — los chips del carrusel
   * público "selecciona tu vehículo", nunca íconos de exterior/interior. */
  generalIcons: GeneralIconOption[];
  /** null = modo creación (/nuevo). */
  vehicleId: string | null;
  /** Foto de perfil vigente — null hasta subir una (solo edición). */
  cardImageUrl?: string | null;
  defaults?: Partial<VehicleBasicsInput>;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // El slug se autogenera de modelo + versión hasta que el usuario lo toca.
  const [slugTouched, setSlugTouched] = useState(Boolean(defaults?.slug));
  // Igual que el slug: la etiqueta de card se deriva `${categoría} · ${versión}`
  // hasta que el usuario la edite a mano (§1.9 — texto libre permitido).
  const [typeTagTouched, setTypeTagTouched] = useState(Boolean(defaults?.typeTag));

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<VehicleBasicsInput>({
    resolver: zodResolver(vehicleBasicsSchema),
    defaultValues: {
      commercialName: defaults?.commercialName ?? "",
      technicalName: defaults?.technicalName ?? "",
      trimLabel: defaults?.trimLabel ?? "",
      slug: defaults?.slug ?? "",
      categoryId: defaults?.categoryId ?? "",
      typeTag: defaults?.typeTag ?? "",
      iconIds: defaults?.iconIds ?? [],
    },
  });

  // useWatch (no watch()): compatible con React Compiler y re-renderiza solo
  // con los campos suscritos.
  const categoryId = useWatch({ control, name: "categoryId" });
  const iconIds = useWatch({ control, name: "iconIds" });
  const trimLabel = useWatch({ control, name: "trimLabel" });
  const activeCategory = categories.find((c) => c.id === categoryId);

  function toggleIcon(id: string) {
    const next = iconIds.includes(id) ? iconIds.filter((i) => i !== id) : [...iconIds, id];
    setValue("iconIds", next, { shouldDirty: true });
  }

  function syncSlug(commercial: string, trim: string) {
    if (!slugTouched) {
      setValue("slug", slugify(commercial, trim), { shouldValidate: false });
    }
  }

  function syncTypeTag(categoryName: string | undefined, trim: string) {
    if (!typeTagTouched && categoryName && trim) {
      setValue("typeTag", `${categoryName} · ${trim}`, { shouldValidate: false });
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setSaved(false);
    const result = vehicleId
      ? await updateVehicleBasics(vehicleId, values)
      : await createVehicle(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    if (vehicleId) {
      setSaved(true);
      router.refresh();
    } else {
      // Recién creado: directo al paso 2 (ficha técnica), como fija el caso
      // de uso — la ficha se completa antes de tocar assets.
      router.push(`/admin/vehiculos/${result.id}?paso=2`);
    }
  });

  const inputClass =
    "h-[46px] rounded-[12px] border border-[var(--adm-border-input)] bg-white px-3.5 text-sm";
  const labelClass =
    "text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]";
  const errorClass = "text-xs font-semibold text-[#b42318]";

  return (
    <form onSubmit={onSubmit} className="flex max-w-[1080px] flex-col gap-[34px]">
      <div>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">
          Datos y categoría del vehículo
        </h2>
        <p className="text-sm text-[var(--adm-muted)]">
          Define la ficha base. El showroom usa ambos nombres (el lead los envía juntos) y
          el slug es la URL pública del vehículo.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={labelClass}>Nombre comercial</span>
          <input
            {...register("commercialName", {
              onChange: (e) => syncSlug(e.target.value, getValues("trimLabel")),
            })}
            placeholder="Ej. Aventura 4X4"
            className={inputClass}
          />
          {errors.commercialName ? (
            <span className={errorClass}>{errors.commercialName.message}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>Nombre técnico</span>
          <input
            {...register("technicalName")}
            placeholder="Ej. Frison T9 4X4"
            className={inputClass}
          />
          {errors.technicalName ? (
            <span className={errorClass}>{errors.technicalName.message}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>Versión</span>
          <input
            {...register("trimLabel", {
              onChange: (e) => {
                syncSlug(getValues("commercialName"), e.target.value);
                syncTypeTag(activeCategory?.name, e.target.value);
              },
            })}
            placeholder="Ej. Gasolina Automática"
            className={inputClass}
          />
          {errors.trimLabel ? <span className={errorClass}>{errors.trimLabel.message}</span> : null}
        </label>

        <label className="flex flex-col gap-2 md:col-span-2">
          <span className={labelClass}>Etiqueta de la card del catálogo</span>
          <input
            {...register("typeTag", { onChange: () => setTypeTagTouched(true) })}
            placeholder="Ej. Pickup · 4×4"
            className={inputClass}
          />
          <span className="text-xs text-[var(--adm-fainter)]">
            Se autollena como «categoría · versión»; edítala si la card debe decir otra cosa
            (ej. «Sedán · Automático»).
          </span>
          {errors.typeTag ? <span className={errorClass}>{errors.typeTag.message}</span> : null}
        </label>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>Slug (URL pública)</span>
          <input
            {...register("slug", { onChange: () => setSlugTouched(true) })}
            className={inputClass}
          />
          {errors.slug ? (
            <span className={errorClass}>{errors.slug.message}</span>
          ) : (
            <span className="text-xs text-[var(--adm-fainter)]">
              Cambiarlo rompe los enlaces ya compartidos con esta URL.
            </span>
          )}
        </label>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold">Categoría</span>
          <span className="text-[12.5px] text-[var(--adm-fainter)]">
            Determina la pestaña del selector público
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {categories.map((cat) => {
            const isActive = cat.id === categoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setValue("categoryId", cat.id, { shouldValidate: true });
                  syncTypeTag(cat.name, trimLabel);
                }}
                className={`flex cursor-pointer flex-col items-start gap-2 rounded-2xl border p-[18px] ${
                  isActive ? "border-black bg-black text-white" : "border-[#e0e0e0] bg-white text-black"
                }`}
              >
                <CatalogIcon
                  d={CATEGORY_ICON_PATHS[cat.slug] ?? FALLBACK_CATEGORY_PATH}
                  size={34}
                  strokeWidth={1.4}
                />
                <span className="text-[13.5px] font-semibold">{cat.name}</span>
                <span className={isActive ? "text-[11.5px] text-white/60" : "text-[11.5px] text-[var(--adm-faint)]"}>
                  {cat.vehicleCount} {cat.vehicleCount === 1 ? "modelo" : "modelos"}
                </span>
              </button>
            );
          })}
        </div>
        {errors.categoryId ? <span className={errorClass}>{errors.categoryId.message}</span> : null}
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold">Foto de perfil</span>
          <span className="text-[12.5px] text-[var(--adm-fainter)]">
            Se muestra en el carrusel del showroom y como miniatura en la biblioteca de vehículos
          </span>
        </div>
        {vehicleId ? (
          <CardImageUploader vehicleId={vehicleId} url={cardImageUrl ?? null} />
        ) : (
          <p className="text-[12.5px] text-[var(--adm-faint)]">
            Podrás cargar la foto de perfil después de crear el vehículo.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold">Combustible y tracción</span>
          <span className="text-[12.5px] text-[var(--adm-fainter)]">
            Chips del carrusel «selecciona tu vehículo» — solo se muestran los 2 primeros
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {generalIcons.map((icon) => {
            const isOn = iconIds.includes(icon.id);
            return (
              <button
                key={icon.id}
                type="button"
                onClick={() => toggleIcon(icon.id)}
                className={`flex cursor-pointer items-center gap-3 rounded-[15px] border bg-white p-3.5 text-black ${
                  isOn ? "border-black" : "border-[var(--adm-line)] opacity-60"
                }`}
              >
                <span
                  className={`flex h-10 w-10 flex-none items-center justify-center rounded-full p-1.5 ${
                    isOn ? "bg-black" : "bg-[var(--adm-surface)]"
                  }`}
                >
                  <HotspotIconImage icon={icon} size={26} />
                </span>
                <span className="text-[13px] font-semibold">{icon.label}</span>
                <span
                  className={`ml-auto h-[9px] w-[9px] flex-none rounded-full border ${
                    isOn ? "border-black bg-black" : "border-[#c9c9c9] bg-white"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {serverError ? (
        <p role="alert" className={errorClass}>
          {serverError}
        </p>
      ) : null}
      {saved ? <p className="text-[13px] font-semibold text-[#067647]">Cambios guardados.</p> : null}

      <div className="flex items-center justify-end border-t border-[var(--adm-line-soft)] pt-[22px]">
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-11 cursor-pointer rounded-full bg-black px-6 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--adm-hover)] disabled:opacity-60"
        >
          {isSubmitting
            ? "Guardando…"
            : vehicleId
              ? "Guardar cambios"
              : "Crear vehículo y continuar"}
        </button>
      </div>
    </form>
  );
}

function CardImageUploader({ vehicleId, url }: { vehicleId: string; url: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function upload(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await saveVehicleCardImage(vehicleId, formData);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      await removeVehicleCardImage(vehicleId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {url ? (
        <div className="relative h-[140px] w-[210px] overflow-hidden rounded-[12px] border border-[var(--adm-line)] bg-[var(--adm-surface)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Foto de perfil" className="h-full w-full object-cover" />
          <button
            type="button"
            disabled={isPending}
            onClick={remove}
            className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/50 bg-black/60 text-white hover:bg-black"
            aria-label="Quitar foto de perfil"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ) : null}

      <label
        className={`flex w-[210px] cursor-pointer items-center justify-center gap-2.5 rounded-[12px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] px-4 hover:border-black hover:bg-white ${
          url ? "h-11" : "h-[110px] flex-col"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        <span className="text-[13px] font-semibold">
          {isPending ? "Subiendo…" : url ? "Reemplazar" : "Cargar foto de perfil"}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={isPending}
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
    </div>
  );
}
