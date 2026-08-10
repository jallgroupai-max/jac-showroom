import { LoginForm } from "./login-form";

// Pantalla de Login — réplica 1:1 del prototipo (data-screen-label="Login"):
// grid de dos columnas, marca JAC|bel arriba a la izquierda, titular
// "Configurador de vehículos", formulario a la derecha.
export default async function LoginPage({
  searchParams,
}: {
  // Next 16: searchParams es una Promise.
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  // El proxy ya valida que solo rutas /admin lleguen aquí; la action vuelve a
  // validar por si el form se manipula.
  const safeCallback = callbackUrl?.startsWith("/admin") ? callbackUrl : "/admin";

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden flex-col justify-between border-r border-[var(--adm-line)] p-[56px_64px] lg:flex">
        <BrandMark />

        <div className="flex max-w-[520px] flex-col gap-[22px]">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--adm-faint)]">
            Panel de administración
          </div>
          <h1 className="text-[54px] font-extrabold leading-[1.02] tracking-[-0.035em] [text-wrap:balance]">
            Configurador
            <br />
            de vehículos
          </h1>
          <p className="text-base leading-[1.6] text-[var(--adm-ink-soft)] [text-wrap:pretty]">
            Gestiona modelos, galerías 360°, colores, puntos de interés y escenarios del
            showroom virtual.
          </p>
        </div>

        <div className="flex gap-7 text-xs tracking-[0.04em] text-[var(--adm-faint)]">
          <span>v0.1.0</span>
          <span>Soporte</span>
          <span>Estado del sistema</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-10 p-[56px_24px] lg:p-[56px_64px]">
        {/* En mobile la columna izquierda se oculta — la marca sube aquí. */}
        <div className="lg:hidden">
          <BrandMark />
        </div>
        <LoginForm callbackUrl={safeCallback} />
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3.5">
      <span className="text-[22px] font-extrabold italic tracking-[-0.04em]">JAC</span>
      <span className="h-5 w-px bg-[var(--adm-border-swatch)]" />
      <span className="text-[13px] font-bold uppercase tracking-[0.22em]">bel</span>
    </div>
  );
}
