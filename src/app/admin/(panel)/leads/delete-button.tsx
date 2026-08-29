"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLead } from "@/lib/admin/api";

// Borrado de un lead de la bandeja. Es irreversible y no hay papelera, así que
// el botón pide confirmación en dos pasos en vez de un `confirm()` del
// navegador: el estado vive en el propio botón y no bloquea la página.
export function DeleteLeadButton({ leadId, fullName }: { leadId: string; fullName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Eliminar el lead de ${fullName}`}
        className="h-8 cursor-pointer rounded-full border border-[var(--adm-border-input)] bg-white px-3.5 text-xs font-semibold text-[var(--adm-faint)] transition-colors hover:border-[#b42318] hover:text-[#b42318]"
      >
        Eliminar
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await deleteLead(leadId);
              // En el caso exitoso la fila desaparece del refresh, así que no
              // hace falta apagar `confirming`.
              if (!result.ok) {
                setError(result.error);
                setConfirming(false);
              } else {
                router.refresh();
              }
            });
          }}
          className="h-8 cursor-pointer rounded-full border border-[#b42318] bg-[#b42318] px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Eliminando…" : "Confirmar"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="h-8 cursor-pointer rounded-full border border-[var(--adm-border-input)] bg-white px-3.5 text-xs font-semibold transition-colors hover:border-black disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
      {error ? <span className="text-[11px] font-semibold text-[#b42318]">{error}</span> : null}
    </div>
  );
}
