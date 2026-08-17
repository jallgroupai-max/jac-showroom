"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createScenario } from "@/lib/admin/api";

// Modal de alta — mismo patrón visual que el del prototipo, con el selector
// de tipo que ni el prototipo ni el artefacto contemplaban (§1.7): imagen
// (foto de ambiente) o color sólido.
export function CreateScenarioModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"image" | "color">("image");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function close() {
    setOpen(false);
    setError(null);
    setFileName(null);
    setKind("image");
  }

  function submit(formData: FormData) {
    setError(null);
    formData.set("kind", kind);
    startTransition(async () => {
      const result = await createScenario(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  const kindPill = (isActive: boolean) =>
    `h-9 flex-1 cursor-pointer rounded-full border text-xs font-semibold ${
      isActive ? "border-black bg-black text-white" : "border-[var(--adm-border-input)] bg-white text-black"
    }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[42px] cursor-pointer items-center gap-[9px] rounded-full border border-black bg-white px-5 text-[13px] font-semibold text-black transition-colors hover:bg-black hover:text-white"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        Cargar escenario
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-8">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="absolute inset-0 cursor-default border-none bg-black/40"
          />
          <form
            ref={formRef}
            action={submit}
            className="relative flex w-full max-w-[520px] flex-col gap-5 rounded-[20px] border border-black bg-white p-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.22)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[19px] font-bold tracking-[-0.02em]">Cargar escenario</div>
                <div className="mt-[5px] text-[12.5px] text-[var(--adm-faint)]">
                  Se añadirá al catálogo global, disponible para cualquier vehículo.
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

            <div className="flex gap-2">
              <button type="button" onClick={() => setKind("image")} className={kindPill(kind === "image")}>
                Imagen de ambiente
              </button>
              <button type="button" onClick={() => setKind("color")} className={kindPill(kind === "color")}>
                Color sólido
              </button>
            </div>

            {kind === "image" ? (
              <label className="flex cursor-pointer flex-col items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] p-[30px] hover:border-black hover:bg-white">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
                <span className="text-sm font-semibold">
                  {fileName ?? "Arrastra la imagen o haz clic para seleccionar"}
                </span>
                <span className="text-xs text-[var(--adm-faint)]">JPG, PNG o WebP · 3840 × 2160 recomendado</span>
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                />
              </label>
            ) : (
              <label className="flex flex-col gap-2">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
                  Color de fondo
                </span>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    name="color"
                    defaultValue="#F4F6F9"
                    className="h-[46px] w-[72px] cursor-pointer rounded-[12px] border border-[var(--adm-border-input)] bg-white p-1"
                  />
                  <span className="text-xs text-[var(--adm-faint)]">
                    Paleta neutra recomendada — no debe competir con los colores del vehículo.
                  </span>
                </div>
              </label>
            )}

            <label className="flex flex-col gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
                Nombre del escenario
              </span>
              <input
                name="label"
                placeholder="Ej. Médanos de Coro"
                className="h-[46px] rounded-[12px] border border-[var(--adm-border-input)] bg-white px-3.5 text-sm"
              />
            </label>

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
                {isPending ? "Cargando…" : "Cargar escenario"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
