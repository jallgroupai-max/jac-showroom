"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCategory } from "@/lib/admin/api";

// Sin "eliminar igualmente", a diferencia de los escenarios: Vehicle.categoryId
// es obligatorio, así que una categoría con vehículos NO se puede borrar de
// ninguna manera — hay que reasignarlos primero. El servidor devuelve el
// motivo y aquí solo se muestra.
export function DeleteCategoryButton({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCategory(categoryId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span className="max-w-[260px] text-right text-[11px] font-semibold text-[#b42318]">
          {error}
        </span>
        <button
          type="button"
          onClick={() => setError(null)}
          className="h-[30px] flex-none cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3 text-xs font-semibold hover:border-black"
        >
          Entendido
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={run}
      className="h-[30px] cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-[13px] text-xs font-semibold transition-colors hover:border-black disabled:opacity-50"
    >
      Eliminar
    </button>
  );
}
