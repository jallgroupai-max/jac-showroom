"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { vehicleSpecsSchema, type VehicleSpecsInput } from "@/lib/admin/schemas";
import { saveVehicleSpecs } from "../actions";

// Paso 2 — Ficha técnica (plan §0.2: va ANTES de los assets). Un único grupo
// fijo (Título + Motor) — el editor envía la ficha completa y el servidor la
// reemplaza entera: lo que se ve es lo que queda.

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
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VehicleSpecsInput>({
    resolver: zodResolver(vehicleSpecsSchema),
    defaultValues: defaults,
  });

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
          Título y motor tal como se ven en el panel del showroom, y la etiqueta de garantía.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={labelClass}>Título</span>
          <input {...register("title")} className={inputClass} />
          {errors.title ? <span className={errorClass}>{errors.title.message}</span> : null}
        </label>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>Motor</span>
          <input {...register("motor")} className={inputClass} />
          {errors.motor ? <span className={errorClass}>{errors.motor.message}</span> : null}
        </label>

        <label className="flex flex-col gap-2 md:col-span-2">
          <span className={labelClass}>Garantía</span>
          <input {...register("warrantyLabel")} className={inputClass} />
          {errors.warrantyLabel ? (
            <span className={errorClass}>{errors.warrantyLabel.message}</span>
          ) : null}
        </label>
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
