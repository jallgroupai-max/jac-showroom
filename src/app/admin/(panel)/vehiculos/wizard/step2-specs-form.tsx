"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useForm,
  useFieldArray,
  type Control,
  type UseFormRegister,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { vehicleSpecsSchema, type VehicleSpecsInput } from "@/lib/admin/schemas";
import { saveVehicleSpecs } from "../actions";

// Paso 2 — Ficha técnica (plan §0.2: va ANTES de los assets). El editor envía
// la ficha completa y el servidor la reemplaza entera: lo que se ve es lo que
// queda. Grupos y filas dinámicos con useFieldArray anidado.

const inputClass =
  "h-[42px] rounded-[11px] border border-[var(--adm-border-input)] bg-white px-3 text-[13.5px]";

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

  const groups = useFieldArray({ control, name: "groups" });

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
          Grupos de especificaciones tal como se ven en el panel del showroom (Motor,
          Transmisión, Dimensiones…) y la etiqueta de garantía.
        </p>
      </div>

      <label className="flex max-w-[520px] flex-col gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
          Garantía
        </span>
        <input
          {...register("warrantyLabel")}
          placeholder="Ej. 5 años o 150.000 km"
          className="h-[46px] rounded-[12px] border border-[var(--adm-border-input)] bg-white px-3.5 text-sm"
        />
      </label>

      <div className="flex flex-col gap-4">
        {groups.fields.map((group, gi) => (
          <div key={group.id} className="rounded-[18px] border border-[var(--adm-line)] p-[18px]">
            <div className="mb-3.5 flex items-center gap-3">
              <input
                {...register(`groups.${gi}.title`)}
                placeholder="Título del grupo — ej. Motor"
                className={`${inputClass} flex-1 font-semibold`}
              />
              <button
                type="button"
                onClick={() => groups.remove(gi)}
                className="h-8 cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3.5 text-xs font-semibold hover:border-black"
              >
                Eliminar grupo
              </button>
            </div>
            {errors.groups?.[gi]?.title ? (
              <p className="mb-2 text-xs font-semibold text-[#b42318]">
                {errors.groups[gi]?.title?.message}
              </p>
            ) : null}
            <GroupItems control={control} register={register} groupIndex={gi} errors={errors} />
          </div>
        ))}

        <button
          type="button"
          onClick={() => groups.append({ title: "", items: [{ label: "", value: "" }] })}
          className="flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] text-black hover:border-black hover:bg-white"
        >
          <span className="text-sm font-semibold">Añadir grupo</span>
          <span className="text-xs text-[var(--adm-faint)]">Motor, Frenos, Dimensiones…</span>
        </button>
      </div>

      {serverError ? (
        <p role="alert" className="text-xs font-semibold text-[#b42318]">
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

// Filas de un grupo — useFieldArray anidado exige su propio componente para
// que cada grupo gestione su array de items de forma independiente.
function GroupItems({
  control,
  register,
  groupIndex,
  errors,
}: {
  control: Control<VehicleSpecsInput>;
  register: UseFormRegister<VehicleSpecsInput>;
  groupIndex: number;
  errors: FieldErrors<VehicleSpecsInput>;
}) {
  const items = useFieldArray({ control, name: `groups.${groupIndex}.items` });

  return (
    <div className="flex flex-col gap-2.5">
      {items.fields.map((item, ii) => {
        const itemErrors = errors.groups?.[groupIndex]?.items?.[ii];
        return (
          <div key={item.id} className="grid grid-cols-[1fr_1fr_36px] items-center gap-2.5">
            <input
              {...register(`groups.${groupIndex}.items.${ii}.label`)}
              placeholder="Etiqueta — ej. Potencia"
              className={inputClass}
              aria-invalid={Boolean(itemErrors?.label)}
            />
            <input
              {...register(`groups.${groupIndex}.items.${ii}.value`)}
              placeholder="Valor — ej. 221 hp"
              className={inputClass}
              aria-invalid={Boolean(itemErrors?.value)}
            />
            <button
              type="button"
              onClick={() => items.remove(ii)}
              aria-label="Eliminar fila"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--adm-line)] bg-white hover:border-black"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => items.append({ label: "", value: "" })}
        className="h-9 w-fit cursor-pointer rounded-full border border-[var(--adm-border-input)] bg-white px-4 text-xs font-semibold hover:border-black"
      >
        Añadir fila
      </button>
    </div>
  );
}
