"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveCategory } from "@/lib/admin/api";

// Reordenar cambia el orden de las pestañas del showroom público, no solo el
// de esta lista. Mismo patrón de flechas que el reordenado de vehículos.
export function MoveCategoryButtons({
  categoryId,
  isFirst,
  isLast,
}: {
  categoryId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function move(direction: "up" | "down") {
    startTransition(async () => {
      await moveCategory(categoryId, direction);
      router.refresh();
    });
  }

  const arrowClass =
    "flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border border-[var(--adm-line)] bg-white transition-colors hover:border-black disabled:cursor-default disabled:opacity-30 disabled:hover:border-[var(--adm-line)]";

  return (
    <div className="flex flex-none gap-1.5">
      <button
        type="button"
        aria-label="Subir en el orden"
        disabled={isFirst || isPending}
        onClick={() => move("up")}
        className={arrowClass}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5m0 0l-6 6m6-6l6 6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Bajar en el orden"
        disabled={isLast || isPending}
        onClick={() => move("down")}
        className={arrowClass}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14m0 0l6-6m-6 6l-6-6" />
        </svg>
      </button>
    </div>
  );
}
