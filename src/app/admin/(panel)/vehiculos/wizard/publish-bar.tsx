"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishVehicle, setVehicleStatus, getPreviewUrl } from "@/lib/admin/api";

// Barra de publicación del wizard (prototipo: "Previsualizar" + "Publicar
// vehículo" en el header). Las guardas se calculan en el servidor y llegan
// como lista — el botón deshabilitado siempre dice POR QUÉ.

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  PAUSED: "Pausado",
};

export function PublishBar({
  vehicleId,
  status,
  blockers,
}: {
  vehicleId: string;
  status: "DRAFT" | "PUBLISHED" | "PAUSED";
  blockers: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function publish() {
    setError(null);
    startTransition(async () => {
      const result = await publishVehicle(vehicleId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function transition(action: "pause" | "republish") {
    setError(null);
    startTransition(async () => {
      const result = await setVehicleStatus(vehicleId, action);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function preview() {
    setError(null);
    startTransition(async () => {
      const result = await getPreviewUrl(vehicleId);
      if (!result.ok || !result.url) setError(result.ok ? "Sin URL" : result.error);
      else window.open(result.url, "_blank", "noopener");
    });
  }

  const pill = (extra: string) =>
    `h-[38px] cursor-pointer rounded-full px-[18px] text-[13px] font-semibold transition-colors disabled:opacity-50 ${extra}`;

  return (
    <div className="flex flex-col gap-2 border-b border-[var(--adm-line)] bg-white px-10 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`flex h-8 items-center rounded-full px-3.5 text-xs font-bold tracking-[0.06em] ${
            status === "PUBLISHED"
              ? "bg-black text-white"
              : "border border-black bg-white text-black"
          }`}
        >
          {STATUS_LABEL[status]}
        </span>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={isPending}
            onClick={preview}
            className={pill("border border-[var(--adm-border-input)] bg-white hover:border-black")}
          >
            Previsualizar
          </button>
          {status === "DRAFT" ? (
            <button
              type="button"
              disabled={isPending || blockers.length > 0}
              onClick={publish}
              title={blockers.length > 0 ? blockers.join("\n") : undefined}
              className={pill("border-none bg-black text-white hover:bg-[var(--adm-hover)]")}
            >
              Publicar vehículo
            </button>
          ) : status === "PUBLISHED" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => transition("pause")}
              className={pill("border border-[var(--adm-border-input)] bg-white hover:border-black")}
            >
              Pausar
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() => transition("republish")}
              className={pill("border-none bg-black text-white hover:bg-[var(--adm-hover)]")}
            >
              Republicar
            </button>
          )}
        </div>
      </div>

      {status === "DRAFT" && blockers.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs font-semibold text-[#b45309]">
          {blockers.map((b) => (
            <li key={b}>· {b}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-semibold text-[#b42318]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
