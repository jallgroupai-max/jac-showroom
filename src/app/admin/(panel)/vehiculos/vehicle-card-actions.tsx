"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setVehicleStatus, moveVehicle } from "@/lib/admin/api";

// Acciones de la card: pausar / republicar / archivar (con confirmación
// inline — sin window.confirm) y orden con flechas. Permisos planos: todo
// usuario autenticado puede hacer todo; la red de seguridad es la bitácora.
export function VehicleCardActions({
  vehicleId,
  status,
}: {
  vehicleId: string;
  status: "DRAFT" | "PUBLISHED" | "PAUSED";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(action: Parameters<typeof setVehicleStatus>[1]) {
    setError(null);
    startTransition(async () => {
      const result = await setVehicleStatus(vehicleId, action);
      if (!result.ok) setError(result.error);
      else router.refresh();
      setConfirmingArchive(false);
    });
  }

  function move(direction: "up" | "down") {
    startTransition(async () => {
      await moveVehicle(vehicleId, direction);
      router.refresh();
    });
  }

  const pill =
    "h-8 cursor-pointer rounded-full border border-[var(--adm-border-input)] bg-white px-3.5 text-xs font-semibold transition-colors hover:border-black disabled:opacity-50";

  if (confirmingArchive) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">¿Archivar?</span>
        <button type="button" disabled={isPending} onClick={() => run("archive")} className={`${pill} border-[#b42318] text-[#b42318] hover:border-[#b42318]`}>
          Sí, archivar
        </button>
        <button type="button" disabled={isPending} onClick={() => setConfirmingArchive(false)} className={pill}>
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={isPending} onClick={() => move("up")} aria-label="Subir en el orden" className={pill}>
        ↑
      </button>
      <button type="button" disabled={isPending} onClick={() => move("down")} aria-label="Bajar en el orden" className={pill}>
        ↓
      </button>
      {status === "PUBLISHED" ? (
        <button type="button" disabled={isPending} onClick={() => run("pause")} className={pill}>
          Pausar
        </button>
      ) : null}
      {status === "PAUSED" ? (
        <button type="button" disabled={isPending} onClick={() => run("republish")} className={pill}>
          Republicar
        </button>
      ) : null}
      <button type="button" disabled={isPending} onClick={() => setConfirmingArchive(true)} className={pill}>
        Archivar
      </button>
      {error ? <span className="w-full text-xs font-semibold text-[#b42318]">{error}</span> : null}
    </div>
  );
}
