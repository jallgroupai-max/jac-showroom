"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteHotspotIcon } from "@/lib/admin/api";

// Sin "eliminar igualmente", igual que con las categorías:
// PointOfInterest.iconId es obligatorio, así que un ícono en uso no se puede
// borrar sin llevarse por delante puntos de interés ya publicados. El servidor
// devuelve dónde está usado y aquí solo se muestra.
export function DeleteIconButton({ iconId }: { iconId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await deleteHotspotIcon(iconId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center gap-2">
        <span className="text-[10.5px] font-semibold leading-tight text-[#b42318]">{error}</span>
        <button
          type="button"
          onClick={() => setError(null)}
          className="ml-auto h-[30px] flex-none cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3 text-xs font-semibold hover:border-black"
        >
          Ok
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={run}
      className="h-[30px] flex-1 cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3 text-xs font-semibold transition-colors hover:border-black disabled:opacity-50"
    >
      Eliminar
    </button>
  );
}
