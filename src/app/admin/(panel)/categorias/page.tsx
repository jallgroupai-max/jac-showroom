import { prisma } from "@/lib/prisma";
import { CategoryIcon } from "../vehiculos/wizard/catalog-icon";
import { CategoryModal } from "./category-modal";
import { DeleteCategoryButton } from "./delete-category-button";
import { MoveCategoryButtons } from "./move-category-buttons";

// Catálogo de categorías de vehículo — mismo patrón que la biblioteca de
// escenarios (listado + modal de alta + borrado con guarda), más el orden,
// que aquí sí es visible para el usuario final: fija el orden de las pestañas
// del selector "Selecciona tu vehículo" del showroom público.
export default async function CategoriasPage() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: {
      _count: { select: { vehicles: { where: { status: { not: "ARCHIVED" } } } } },
    },
  });

  return (
    <main className="flex flex-col gap-[26px] px-10 pb-[60px] pt-[34px]">
      <div className="flex items-end justify-between gap-5">
        <div>
          <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">
            Categorías de vehículo
          </h2>
          <p className="text-sm text-[var(--adm-muted)]">
            {categories.length} {categories.length === 1 ? "categoría" : "categorías"} · el orden
            de esta lista es el de las pestañas del showroom
          </p>
        </div>
        <CategoryModal mode="create" />
      </div>

      <div className="flex flex-col overflow-hidden rounded-[18px] border border-[var(--adm-line)]">
        {categories.map((cat, index) => (
          <div
            key={cat.id}
            className="flex items-center gap-4 border-b border-[var(--adm-line-soft)] px-5 py-4 last:border-b-0"
          >
            <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-surface-soft)]">
              <CategoryIcon category={cat} size={30} />
            </span>

            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-bold tracking-[-0.01em]">{cat.name}</span>
              <span className="mt-0.5 text-[11.5px] text-[var(--adm-fainter)]">
                /{cat.slug} · {cat.iconUrl ? "ícono propio" : "ícono por defecto"}
              </span>
            </div>

            <span className="ml-auto text-[11.5px] text-[var(--adm-faint)]">
              {cat._count.vehicles === 0
                ? "Sin vehículos"
                : `${cat._count.vehicles} ${cat._count.vehicles === 1 ? "vehículo" : "vehículos"}`}
            </span>

            <MoveCategoryButtons
              categoryId={cat.id}
              isFirst={index === 0}
              isLast={index === categories.length - 1}
            />
            <CategoryModal
              mode="edit"
              category={{
                id: cat.id,
                name: cat.name,
                slug: cat.slug,
                iconUrl: cat.iconUrl,
              }}
            />
            <DeleteCategoryButton categoryId={cat.id} />
          </div>
        ))}

        {categories.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2.5 text-center">
            <span className="text-sm font-semibold">Aún no hay categorías</span>
            <span className="text-xs text-[var(--adm-faint)]">
              Sin al menos una categoría no se puede crear un vehículo.
            </span>
          </div>
        ) : null}
      </div>
    </main>
  );
}
