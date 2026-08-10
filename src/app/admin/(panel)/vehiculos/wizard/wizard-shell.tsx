import Link from "next/link";
import {
  WIZARD_STEPS,
  stepMeta,
  completedSections,
  type WizardCounts,
} from "./steps";

// Estructura del wizard según el prototipo: nav lateral de 268px con los
// pasos numerados y la card de completitud abajo; contenido a la derecha.
export function WizardShell({
  vehicleId,
  activeStep,
  counts,
  children,
}: {
  /** null en /nuevo — todavía no existe el registro (§0.2). */
  vehicleId: string | null;
  activeStep: number;
  counts: WizardCounts | null;
  children: React.ReactNode;
}) {
  const done = counts ? completedSections(counts) : 0;

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[268px_1fr]">
      <nav className="flex flex-col gap-1.5 border-r border-[var(--adm-line)] px-[18px] py-[26px]">
        <div className="px-3 pb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--adm-fainter)]">
          Pasos
        </div>

        {WIZARD_STEPS.map((step) => {
          const isActive = step.num === activeStep;
          // Sin registro aún, solo el paso 1 es navegable; con registro, los
          // pasos de fases futuras se muestran pero no navegan.
          const isNavigable =
            step.pendingPhase === null && (vehicleId !== null || step.num === 1);
          const href =
            vehicleId === null
              ? "/admin/vehiculos/nuevo"
              : `/admin/vehiculos/${vehicleId}?paso=${step.num}`;

          const inner = (
            <>
              <span
                className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border text-[11px] font-bold tracking-[0.06em] ${
                  isActive ? "border-white/40" : "border-[#e0e0e0]"
                }`}
              >
                {String(step.num).padStart(2, "0")}
              </span>
              <span className="flex flex-col gap-0.5 text-left">
                <span className="text-[13.5px] font-semibold">{step.title}</span>
                <span
                  className={`text-[11.5px] ${isActive ? "text-white/65" : "text-[var(--adm-fainter)]"}`}
                >
                  {stepMeta(step, counts)}
                </span>
              </span>
            </>
          );

          const baseClass =
            "flex w-full items-center gap-3 rounded-[13px] p-3 text-left no-underline";
          if (isActive) {
            return (
              <span key={step.num} className={`${baseClass} border border-black bg-black text-white`}>
                {inner}
              </span>
            );
          }
          if (!isNavigable) {
            return (
              <span key={step.num} className={`${baseClass} border border-transparent opacity-50`}>
                {inner}
              </span>
            );
          }
          return (
            <Link
              key={step.num}
              href={href}
              className={`${baseClass} border border-transparent text-black hover:border-[var(--adm-line)]`}
            >
              {inner}
            </Link>
          );
        })}

        <div className="mt-auto rounded-[14px] border border-[var(--adm-line)] p-4">
          <div className="mb-2 text-xs font-bold tracking-[0.02em]">Completitud</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#efefef]">
            <div className="h-full bg-black" style={{ width: `${(done / WIZARD_STEPS.length) * 100}%` }} />
          </div>
          <div className="mt-2 text-[11.5px] text-[var(--adm-faint)]">
            {done} de {WIZARD_STEPS.length} secciones con contenido
          </div>
        </div>
      </nav>

      <main className="overflow-auto px-10 pb-[60px] pt-[34px]">
        {children}
        {vehicleId !== null ? <StepFooterNav vehicleId={vehicleId} activeStep={activeStep} /> : null}
      </main>
    </div>
  );
}

// Navegación secuencial entre pasos — complementa la nav lateral: en
// pantallas angostas (o al final de un paso largo) permite avanzar/retroceder
// sin volver arriba. El paso 1 retrocede a la lista de vehículos.
function StepFooterNav({ vehicleId, activeStep }: { vehicleId: string; activeStep: number }) {
  const prev = WIZARD_STEPS.find((s) => s.num === activeStep - 1);
  const next = WIZARD_STEPS.find((s) => s.num === activeStep + 1);
  const linkClass =
    "flex h-11 items-center gap-2 rounded-full border border-[var(--adm-border-input)] bg-white px-5 text-[13.5px] font-semibold text-black no-underline hover:border-black";

  return (
    <div className="mt-9 flex max-w-[1180px] items-center justify-between border-t border-[var(--adm-line-soft)] pt-[22px]">
      <Link
        href={prev ? `/admin/vehiculos/${vehicleId}?paso=${prev.num}` : "/admin/vehiculos"}
        className={linkClass}
      >
        <span aria-hidden>←</span>
        {prev ? prev.title : "Todos los vehículos"}
      </Link>
      {next ? (
        <Link href={`/admin/vehiculos/${vehicleId}?paso=${next.num}`} className={linkClass}>
          {next.title}
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}
