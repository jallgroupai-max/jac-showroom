"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { vehicleBasicsSchema, type VehicleBasicsInput } from "@/lib/admin/schemas";
import { slugify } from "@/lib/admin/slug";
import { createVehicle, updateVehicleBasics } from "../actions";
import { CatalogIcon, CATEGORY_ICON_PATHS, FALLBACK_CATEGORY_PATH } from "./catalog-icon";

type CategoryOption = { id: string; slug: string; name: string; vehicleCount: number };
type IconOption = { id: string; key: string; label: string; group: string; svgPath: string };

const GROUP_LABELS: Record<string, string> = {
  EXTERIOR: "Exterior",
  INTERIOR: "Interior",
  GENERAL: "General",
};

export function Step1Form({
  categories,
  icons,
  vehicleId,
  defaults,
}: {
  categories: CategoryOption[];
  icons: IconOption[];
  /** null = modo creación (/nuevo). */
  vehicleId: string | null;
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

  function toggleIcon(id: string) {
    const next = iconIds.includes(id) ? iconIds.filter((i) => i !== id) : [...iconIds, id];
    setValue("iconIds", next, { shouldDirty: true });
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
          <span className="text-sm font-bold">Características e íconos</span>
          <span className="text-[12.5px] text-[var(--adm-fainter)]">
            Se muestran en la card del catálogo · {iconIds.length} activos
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {icons.map((icon) => {
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
                  className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${
                    isOn ? "bg-black text-white" : "bg-[var(--adm-surface)] text-black"
                  }`}
                >
                  <CatalogIcon d={icon.svgPath} />
                </span>
                <span className="flex flex-col gap-0.5 text-left">
                  <span className="text-[13px] font-semibold">{icon.label}</span>
                  <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--adm-faint)]">
                    {GROUP_LABELS[icon.group] ?? icon.group}
                  </span>
                </span>
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
