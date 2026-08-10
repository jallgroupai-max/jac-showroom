"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteScenario } from "./actions";

// Borrado con guarda: el primer intento sin force — si el escenario está en
// uso, el servidor devuelve el impacto y aquí se pide la confirmación
// explícita (plan A1: nunca un borrado silencioso en cadena).
export function DeleteScenarioButton({ scenarioId }: { scenarioId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  function run(force: boolean) {
    startTransition(async () => {
      const result = await deleteScenario(scenarioId, force);
      if (!result.ok) {
        setConfirmMessage(result.error);
        return;
      }
      setConfirmMessage(null);
      router.refresh();
    });
  }

  if (confirmMessage) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-right text-[11px] font-semibold text-[#b42318]">{confirmMessage}</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(true)}
            className="h-[30px] cursor-pointer rounded-full border border-[#b42318] bg-white px-3 text-xs font-semibold text-[#b42318] disabled:opacity-50"
          >
            Eliminar igualmente
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmMessage(null)}
            className="h-[30px] cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3 text-xs font-semibold hover:border-black"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => run(false)}
      className="h-[30px] cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-[13px] text-xs font-semibold transition-colors hover:border-black disabled:opacity-50"
    >
      Eliminar
    </button>
  );
}
