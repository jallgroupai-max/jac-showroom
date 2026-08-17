"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleVehicleScenario, saveOwnBackground, removeOwnBackground } from "@/lib/admin/api";
import { CreateScenarioModal } from "../../escenarios/create-scenario-modal";

// Paso 6 — Escenarios de fondo (Req 8, prototipo "Escenarios de fondo"):
// checklist del catálogo global con toggle por vehículo, alta inline sin
// salir del wizard (reutiliza el modal de la biblioteca), y el fondo PROPIO
// del vehículo — default del selector de Escena del showroom (TRD §4.5).

export type ScenarioOption = {
  id: string;
  label: string;
  imageUrl: string | null;
  color: string | null;
  enabled: boolean;
};

export function Step6Scenarios({
  vehicleId,
  ownBackgroundUrl,
  scenarios,
}: {
  vehicleId: string;
  ownBackgroundUrl: string | null;
  scenarios: ScenarioOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const enabledScenarios = scenarios.filter((s) => s.enabled);

  function toggle(scenario: ScenarioOption) {
    setError(null);
    startTransition(async () => {
      const result = await toggleVehicleScenario(vehicleId, scenario.id, !scenario.enabled);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex max-w-[1180px] flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">Escenarios de fondo</h2>
          <p className="text-sm text-[var(--adm-muted)]">
            Selecciona los escenarios disponibles para este vehículo ·{" "}
            {enabledScenarios.length} de {scenarios.length} seleccionados
          </p>
        </div>
        {/* Alta inline (Req 8): el modal agrega al catálogo global y al
            volver el checklist ya lo lista — sin salir del wizard. */}
        <CreateScenarioModal />
      </div>

      <div className="grid items-start gap-[26px] lg:grid-cols-[1fr_372px]">
        <div className="flex flex-col gap-3">
          {scenarios.length === 0 ? (
            <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] text-center">
              <span className="text-sm font-semibold">El catálogo global está vacío</span>
              <span className="text-xs text-[var(--adm-faint)]">
                Crea el primer escenario con el botón de arriba.
              </span>
            </div>
          ) : (
            scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                disabled={isPending}
                onClick={() => toggle(scenario)}
                className={`flex cursor-pointer items-center gap-4 rounded-2xl border px-[18px] py-3.5 text-left ${
                  scenario.enabled ? "border-black bg-[#fafafa]" : "border-[var(--adm-line)] bg-white"
                } disabled:opacity-60`}
              >
                <span
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-[7px] border ${
                    scenario.enabled
                      ? "border-black bg-black text-white"
                      : "border-[#cfcfcf] bg-white text-transparent"
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                </span>
                <span className="flex h-16 w-28 flex-none items-center justify-center overflow-hidden rounded-[10px] border border-[var(--adm-line)] bg-[var(--adm-surface)]">
                  {scenario.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={scenario.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="h-full w-full" style={{ background: scenario.color ?? "#f4f4f4" }} />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold">{scenario.label}</span>
                  <span className="text-[11.5px] text-[var(--adm-fainter)]">
                    {scenario.imageUrl ? "Imagen de ambiente" : `Color sólido · ${scenario.color}`}
                  </span>
                </span>
                <span
                  className={`flex h-8 flex-none items-center rounded-full px-[15px] text-xs font-semibold ${
                    scenario.enabled
                      ? "bg-black text-white"
                      : "border border-[var(--adm-border-input)] bg-white text-[var(--adm-faint)]"
                  }`}
                >
                  {scenario.enabled ? "Disponible" : "No disponible"}
                </span>
              </button>
            ))
          )}
          <div className="px-1 text-xs text-[var(--adm-fainter)]">
            Los escenarios se administran en la biblioteca global; aquí solo defines los
            disponibles para este vehículo.
          </div>
          {error ? (
            <p role="alert" className="text-xs font-semibold text-[#b42318]">
              {error}
            </p>
          ) : null}
        </div>

        {/* Aside: fondo propio + vista previa del selector público */}
        <aside className="flex flex-col gap-3.5 rounded-[18px] border border-[var(--adm-line)] p-[22px]">
          <div>
            <div className="text-[15px] font-bold tracking-[-0.01em]">Fondo propio del vehículo</div>
            <div className="mt-1 text-[12.5px] text-[var(--adm-faint)]">
              Es el fondo por defecto del selector de Escena — distinto por modelo.
            </div>
          </div>

          <OwnBackground vehicleId={vehicleId} url={ownBackgroundUrl} />

          <div className="h-px bg-[var(--adm-line-soft)]" />

          <div className="text-xs font-bold tracking-[0.02em]">Vista previa del selector público</div>
          <div className="flex flex-col gap-2.5">
            {enabledScenarios.map((scenario) => (
              <div
                key={scenario.id}
                className="relative flex h-[72px] items-center justify-center overflow-hidden rounded-[12px] border border-[var(--adm-line)] bg-[#f0f0f0]"
              >
                {scenario.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scenario.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0" style={{ background: scenario.color ?? "#f0f0f0" }} />
                )}
                <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_40%,rgba(0,0,0,0.45))]" />
                <span className="relative text-[13px] font-bold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">
                  {scenario.label}
                </span>
              </div>
            ))}
            {enabledScenarios.length === 0 ? (
              <p className="text-[11.5px] leading-[1.6] text-[var(--adm-fainter)]">
                Solo aparecen los escenarios seleccionados.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function OwnBackground({ vehicleId, url }: { vehicleId: string; url: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function upload(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await saveOwnBackground(vehicleId, formData);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      await removeOwnBackground(vehicleId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {url ? (
        <div className="relative h-[110px] overflow-hidden rounded-[12px] border border-[var(--adm-line)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Fondo propio" className="h-full w-full object-cover" />
          <button
            type="button"
            disabled={isPending}
            onClick={remove}
            className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/50 bg-black/60 text-white hover:bg-black"
            aria-label="Quitar fondo propio"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ) : null}

      <label
        className={`flex cursor-pointer items-center justify-center gap-2.5 rounded-[12px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] px-4 hover:border-black hover:bg-white ${
          url ? "h-11" : "h-[88px] flex-col"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        <span className="text-[13px] font-semibold">
          {isPending ? "Subiendo…" : url ? "Reemplazar" : "Cargar fondo propio"}
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
