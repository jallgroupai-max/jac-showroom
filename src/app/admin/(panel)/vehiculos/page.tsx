import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { updatedAgo } from "@/lib/admin/time";
import { CatalogIcon, CATEGORY_ICON_PATHS, FALLBACK_CATEGORY_PATH } from "./wizard/catalog-icon";
import { VehicleCardActions } from "./vehicle-card-actions";

// Biblioteca de vehículos — 1:1 con el prototipo ("Vehículos cargados"):
// filtros por categoría en pills, búsqueda, grid de cards con badge de
// estado y chips de conteos CALCULADOS (en el prototipo eran fijos).

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  PAUSED: "Pausado",
};

export default async function VehiculosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>;
}) {
  const { categoria, q } = await searchParams;

  const [categories, vehicles, totals] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.vehicle.findMany({
      where: {
        status: { not: "ARCHIVED" },
        ...(categoria ? { category: { slug: categoria } } : {}),
        ...(q
          ? {
              OR: [
                { commercialName: { contains: q, mode: "insensitive" } },
                { technicalName: { contains: q, mode: "insensitive" } },
                { trimLabel: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { order: "asc" },
      include: {
        category: true,
        _count: {
          select: {
            colors: true,
            pointsOfInterest: true,
            scenarios: { where: { enabled: true } },
          },
        },
      },
    }),
    prisma.vehicle.groupBy({
      by: ["status"],
      where: { status: { not: "ARCHIVED" } },
      _count: true,
    }),
  ]);

  const totalCount = totals.reduce((sum, t) => sum + t._count, 0);
  const publishedCount = totals.find((t) => t.status === "PUBLISHED")?._count ?? 0;

  const filterPill = (isActive: boolean) =>
    `flex h-[34px] items-center rounded-full border px-4 text-[12.5px] font-semibold no-underline ${
      isActive
        ? "border-black bg-black text-white"
        : "border-[var(--adm-border-input)] bg-white text-black hover:border-black"
    }`;

  return (
    <main className="flex flex-col gap-[26px] px-10 pb-[60px] pt-[34px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">Vehículos cargados</h2>
          <p className="text-sm text-[var(--adm-muted)]">
            {vehicles.length} de {totalCount} {totalCount === 1 ? "vehículo" : "vehículos"} ·{" "}
            {publishedCount} {publishedCount === 1 ? "publicado" : "publicados"}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <form method="GET" className="flex h-[42px] items-center gap-[9px] rounded-full border border-[var(--adm-border-input)] px-4">
            {categoria ? <input type="hidden" name="categoria" value={categoria} /> : null}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5L21 21" />
            </svg>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar modelo"
              className="w-[150px] border-none bg-transparent text-[13px] outline-none"
            />
          </form>
          <Link
            href="/admin/vehiculos/nuevo"
            className="flex h-[42px] items-center gap-2 rounded-full bg-black px-5 text-[13px] font-semibold text-white no-underline transition-colors hover:bg-[var(--adm-hover)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo vehículo
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={q ? `/admin/vehiculos?q=${encodeURIComponent(q)}` : "/admin/vehiculos"} className={filterPill(!categoria)}>
          Todos
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/admin/vehiculos?categoria=${cat.slug}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={filterPill(categoria === cat.slug)}
          >
            {cat.name}
          </Link>
        ))}
      </div>

      {vehicles.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] text-center">
          <span className="text-sm font-semibold">
            {q || categoria ? "Sin resultados con estos filtros" : "Aún no hay vehículos"}
          </span>
          <Link href="/admin/vehiculos/nuevo" className="adm-link text-xs">
            Crear el primero
          </Link>
        </div>
      ) : (
        <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(268px,1fr))]">
          {vehicles.map((v) => (
            <div key={v.id} className="flex flex-col overflow-hidden rounded-[18px] border border-[var(--adm-line)] bg-white">
              <div className="relative flex aspect-[4/3] items-center justify-center border-b border-[var(--adm-line)] bg-[var(--adm-surface)] text-[#a8a8a8]">
                {v.cardImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.cardImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <CatalogIcon
                    d={CATEGORY_ICON_PATHS[v.category.slug] ?? FALLBACK_CATEGORY_PATH}
                    size={30}
                    strokeWidth={1.2}
                  />
                )}
                <span
                  className={`absolute left-3 top-3 rounded-full px-[11px] py-[5px] text-[11px] font-bold tracking-[0.06em] ${
                    v.status === "PUBLISHED"
                      ? "bg-black text-white"
                      : "border border-black bg-white text-black"
                  }`}
                >
                  {STATUS_LABEL[v.status]}
                </span>
                <span className="absolute bottom-3 left-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--adm-faint)]">
                  {v.category.name}
                </span>
              </div>

              <div className="flex flex-col gap-3.5 p-[18px]">
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[17px] font-bold tracking-[-0.02em]">{v.commercialName}</span>
                  <span className="text-[12.5px] text-[var(--adm-faint)]">
                    {v.category.name} · {v.trimLabel}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-[var(--adm-line)] px-2.5 py-[5px] text-[11.5px] font-semibold">
                    {v._count.colors} colores
                  </span>
                  <span className="rounded-full border border-[var(--adm-line)] px-2.5 py-[5px] text-[11.5px] font-semibold">
                    {v._count.pointsOfInterest} POI
                  </span>
                  <span className="rounded-full border border-[var(--adm-line)] px-2.5 py-[5px] text-[11.5px] font-semibold">
                    {v._count.scenarios} escenarios
                  </span>
                </div>

                <VehicleCardActions
                  vehicleId={v.id}
                  status={v.status as "DRAFT" | "PUBLISHED" | "PAUSED"}
                />

                <div className="flex items-center justify-between border-t border-[var(--adm-line-soft)] pt-3">
                  <span className="text-[11.5px] text-[var(--adm-fainter)]">{updatedAgo(v.updatedAt)}</span>
                  <Link
                    href={`/admin/vehiculos/${v.id}`}
                    className="flex h-8 items-center rounded-full border border-[var(--adm-border-input)] bg-white px-3.5 text-xs font-semibold text-black no-underline transition-colors hover:border-black"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
