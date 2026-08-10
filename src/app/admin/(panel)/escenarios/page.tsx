/* eslint-disable @next/next/no-img-element -- miniaturas locales de tamaño
   fijo; next/image no aporta nada sobre archivos de public/uploads. */
import { prisma } from "@/lib/prisma";
import { CreateScenarioModal } from "./create-scenario-modal";
import { DeleteScenarioButton } from "./delete-scenario-button";

// Biblioteca global de escenarios — 1:1 con el prototipo ("Escenarios
// cargados"), más el tipo color sólido (§1.7). "Usado en N vehículos" es
// calculado; el borrado pasa por la guarda del server action.
export default async function EscenariosPage() {
  const scenarios = await prisma.scenario.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { vehicles: true } } },
  });

  return (
    <main className="flex flex-col gap-[26px] px-10 pb-[60px] pt-[34px]">
      <div className="flex items-end justify-between gap-5">
        <div>
          <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">Escenarios cargados</h2>
          <p className="text-sm text-[var(--adm-muted)]">
            {scenarios.length} {scenarios.length === 1 ? "escenario" : "escenarios"} en el
            catálogo global
          </p>
        </div>
        <CreateScenarioModal />
      </div>

      <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(262px,1fr))]">
        {scenarios.map((s) => (
          <div key={s.id} className="flex flex-col overflow-hidden rounded-[18px] border border-[var(--adm-line)]">
            <div className="flex aspect-video items-center justify-center border-b border-[var(--adm-line)] bg-[var(--adm-surface)] text-[#a8a8a8]">
              {s.imageUrl ? (
                <img src={s.imageUrl} alt={s.label} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full" style={{ background: s.color ?? "#f4f4f4" }} />
              )}
            </div>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-col">
                <div className="text-[14.5px] font-bold tracking-[-0.01em]">{s.label}</div>
                <div className="mt-1 text-[11.5px] text-[var(--adm-fainter)]">
                  {s.imageUrl ? "Imagen de ambiente" : `Color sólido · ${s.color}`}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--adm-line-soft)] pt-3">
                <span className="text-[11.5px] text-[var(--adm-faint)]">
                  {s._count.vehicles === 0
                    ? "Sin vehículos asignados"
                    : `Usado en ${s._count.vehicles} ${s._count.vehicles === 1 ? "vehículo" : "vehículos"}`}
                </span>
                <DeleteScenarioButton scenarioId={s.id} />
              </div>
            </div>
          </div>
        ))}

        {scenarios.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] text-center">
            <span className="text-sm font-semibold">Aún no hay escenarios</span>
            <span className="text-xs text-[var(--adm-faint)]">
              Carga una imagen de ambiente o define un color sólido.
            </span>
          </div>
        ) : null}
      </div>
    </main>
  );
}
