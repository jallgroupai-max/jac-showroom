"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { vehicleSpecsSchema, type VehicleSpecsInput } from "@/lib/admin/schemas";
import { saveVehicleSpecs } from "@/lib/admin/api";

// Paso 2 — Ficha técnica (plan §0.2: va ANTES de los assets). Un único grupo
// fijo (Título) con una lista LIBRE de filas etiqueta+valor — el editor envía
// la ficha completa y el servidor la reemplaza entera: lo que se ve es lo
// que queda.

const labelClass = "text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]";
const inputClass =
  "h-[46px] rounded-[12px] border border-[var(--adm-border-input)] bg-white px-3.5 text-sm";
const errorClass = "text-xs font-semibold text-[#b42318]";

export function Step2SpecsForm({
  vehicleId,
  defaults,
}: {
  vehicleId: string;
  defaults: VehicleSpecsInput;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VehicleSpecsInput>({
    resolver: zodResolver(vehicleSpecsSchema),
    defaultValues: defaults,
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  // Vehículo nuevo sin ficha todavía: arranca con una fila vacía en vez de
  // una lista vacía confusa (la validación solo corre al enviar).
  useEffect(() => {
    if (fields.length === 0) append({ label: "", value: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setSaved(false);
    const result = await saveVehicleSpecs(vehicleId, values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-[1080px] flex-col gap-[30px]">
      <div>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">Ficha técnica</h2>
        <p className="text-sm text-[var(--adm-muted)]">
          Título del grupo y una lista libre de especificaciones (etiqueta + valor) tal como se
          ven en el panel del showroom, y la etiqueta de garantía.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 md:col-span-2">
          <span className={labelClass}>Título</span>
          <input {...register("title")} className={inputClass} />
          {errors.title ? <span className={errorClass}>{errors.title.message}</span> : null}
        </label>

        <label className="flex flex-col gap-2 md:col-span-2">
          <span className={labelClass}>Garantía</span>
          <input {...register("warrantyLabel")} className={inputClass} />
          {errors.warrantyLabel ? (
            <span className={errorClass}>{errors.warrantyLabel.message}</span>
          ) : null}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <span className={labelClass}>Especificaciones</span>
        <div className="flex flex-col gap-2.5">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <input
                    {...register(`items.${index}.label`)}
                    placeholder="Ej. Potencia"
                    className={inputClass}
                  />
                  {errors.items?.[index]?.label ? (
                    <span className={errorClass}>{errors.items[index]?.label?.message}</span>
                  ) : null}
                </label>
                <label className="flex flex-col gap-1.5">
                  <input
                    {...register(`items.${index}.value`)}
                    placeholder="Ej. 150 hp"
                    className={inputClass}
                  />
                  {errors.items?.[index]?.value ? (
                    <span className={errorClass}>{errors.items[index]?.value?.message}</span>
                  ) : null}
                </label>
              </div>
              <button
                type="button"
                disabled={fields.length === 1}
                onClick={() => remove(index)}
                aria-label={`Eliminar fila ${index + 1}`}
                className="mt-[3px] flex h-[46px] w-[46px] flex-none cursor-pointer items-center justify-center rounded-full border border-[var(--adm-line)] bg-white hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        {errors.items?.message ? <span className={errorClass}>{errors.items.message}</span> : null}
        <button
          type="button"
          onClick={() => append({ label: "", value: "" })}
          className="flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-full border border-[var(--adm-border-input)] bg-white px-4 text-xs font-semibold hover:border-black"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Agregar fila
        </button>
      </div>

      {serverError ? (
        <p role="alert" className={errorClass}>
          {serverError}
        </p>
      ) : null}
      {saved ? <p className="text-[13px] font-semibold text-[#067647]">Ficha guardada.</p> : null}

      <div className="flex items-center justify-end border-t border-[var(--adm-line-soft)] pt-[22px]">
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-11 cursor-pointer rounded-full bg-black px-6 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--adm-hover)] disabled:opacity-60"
        >
          {isSubmitting ? "Guardando…" : "Guardar ficha técnica"}
        </button>
      </div>
    </form>
  );
}
