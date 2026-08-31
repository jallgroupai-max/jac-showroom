"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory } from "@/lib/admin/api";
import { slugify } from "@/lib/admin/slug";

type Category = { id: string; name: string; slug: string; iconUrl: string | null };

// Un solo modal para alta y edición: los campos son idénticos y mantenerlos
// en un componente evita que el formulario de edición se quede atrás cuando
// el de alta cambie (mismo criterio que Step1Form, que también sirve a
// /nuevo y a /[id]).
export function CategoryModal(
  props: { mode: "create" } | { mode: "edit"; category: Category },
) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const category = isEdit ? props.category : null;

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  // Al crear, el slug se deriva del nombre hasta que el admin lo toque; al
  // editar nunca se re-deriva solo (cambiarlo rompe enlaces ya compartidos).
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
    setFileName(null);
    setRemoveIcon(false);
    setName(category?.name ?? "");
    setSlug(category?.slug ?? "");
    setSlugTouched(isEdit);
  }

  function submit(formData: FormData) {
    setError(null);
    if (removeIcon) formData.set("removeIcon", "true");
    startTransition(async () => {
      const result = category
        ? await updateCategory(category.id, formData)
        : await createCategory(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  // El ícono vigente solo se muestra mientras no se haya pedido quitarlo ni
  // elegido un reemplazo — así el estado del modal refleja lo que se guardará.
  const showsCurrentIcon = Boolean(category?.iconUrl) && !removeIcon && fileName === null;

  return (
    <>
      {isEdit ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-[30px] cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-[13px] text-xs font-semibold transition-colors hover:border-black"
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
          Nueva categoría
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
            className="relative flex w-full max-w-[520px] flex-col gap-5 rounded-[20px] border border-black bg-white p-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.22)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[19px] font-bold tracking-[-0.02em]">
                  {isEdit ? "Editar categoría" : "Nueva categoría"}
                </div>
                <div className="mt-[5px] text-[12.5px] text-[var(--adm-faint)]">
                  Aparecerá como pestaña del showroom y como opción en el paso 1 del wizard.
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
                name="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                placeholder="Ej. Camiones"
                className="h-[46px] rounded-[12px] border border-[var(--adm-border-input)] bg-white px-3.5 text-sm"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
                Slug
              </span>
              <input
                name="slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                placeholder="camiones"
                className="h-[46px] rounded-[12px] border border-[var(--adm-border-input)] bg-white px-3.5 text-sm"
              />
              <span className="text-xs text-[var(--adm-fainter)]">
                {isEdit
                  ? "Identifica la pestaña en el showroom — cambiarlo rompe los enlaces ya compartidos."
                  : "Se genera del nombre; solo minúsculas, números y guiones."}
              </span>
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
                Ícono (SVG)
              </span>
              <div className="flex items-center gap-3">
                {showsCurrentIcon ? (
                  <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-surface-soft)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={category!.iconUrl!} alt="" width={30} height={30} className="object-contain" />
                  </span>
                ) : null}

                <label className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2.5 rounded-[12px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] px-4 hover:border-black hover:bg-white">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                  </svg>
                  <span className="truncate text-[13px] font-semibold">
                    {fileName ?? (category?.iconUrl ? "Reemplazar SVG" : "Cargar SVG")}
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

                {showsCurrentIcon ? (
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
                  ? "Al guardar volverá a la silueta por defecto."
                  : "Opcional, máx. 64 KB. Sin ícono se usa una silueta genérica. Solo se ve en el panel — las pestañas del showroom son de texto."}
              </span>
            </div>

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
                {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear categoría"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
