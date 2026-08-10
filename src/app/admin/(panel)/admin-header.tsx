"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "./actions";

// Header del panel — réplica del prototipo: marca JAC|bel, tabs en píldora
// sobre fondo #f4f4f4 (activa: negra), botón Salir. Sticky, 66px.
const TABS = [
  { label: "Vehículos", href: "/admin/vehiculos" },
  { label: "Escenarios", href: "/admin/escenarios" },
  { label: "Leads", href: "/admin/leads" },
  { label: "Nuevo vehículo", href: "/admin/vehiculos/nuevo" },
] as const;

export function AdminHeader({ userName }: { userName: string }) {
  const pathname = usePathname();

  // "Nuevo vehículo" es más específica que "Vehículos": gana la coincidencia
  // más larga para que /admin/vehiculos/nuevo no active ambas.
  const activeHref = TABS.reduce<string | null>(
    (best, tab) =>
      pathname.startsWith(tab.href) && (best === null || tab.href.length > best.length)
        ? tab.href
        : best,
    null,
  );

  return (
    <header className="sticky top-0 z-20 flex h-[66px] flex-none items-center justify-between border-b border-[var(--adm-line)] bg-white px-[26px]">
      <div className="flex items-center gap-[18px]">
        <div className="flex items-center gap-3">
          <span className="text-lg font-extrabold italic tracking-[-0.04em]">JAC</span>
          <span className="h-4 w-px bg-[var(--adm-border-swatch)]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.22em]">bel</span>
        </div>
        <span className="h-[22px] w-px bg-[var(--adm-line)]" />
        <nav className="flex items-center gap-1 rounded-full bg-[var(--adm-surface)] p-1">
          {TABS.map((tab) => {
            const isActive = tab.href === activeHref;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  isActive
                    ? "flex h-8 items-center rounded-full bg-black px-4 text-[12.5px] font-semibold text-white no-underline"
                    : "flex h-8 items-center rounded-full px-4 text-[12.5px] font-semibold text-[#5a5a5a] no-underline hover:text-black"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Un solo usuario administra el showroom — su nombre lleva a editar
            la cuenta (nombre, correo, contraseña). */}
        <Link
          href="/admin/cuenta"
          className={
            pathname.startsWith("/admin/cuenta")
              ? "hidden h-[38px] items-center rounded-full border border-black bg-black px-4 text-[12.5px] font-semibold text-white no-underline sm:flex"
              : "hidden h-[38px] items-center rounded-full border border-transparent px-4 text-[12.5px] text-[var(--adm-faint)] no-underline hover:border-[var(--adm-border-input)] hover:text-black sm:flex"
          }
        >
          {userName}
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="h-[38px] cursor-pointer rounded-full border border-[var(--adm-border-input)] bg-white px-[18px] text-[13px] font-semibold transition-colors hover:border-black"
          >
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}
