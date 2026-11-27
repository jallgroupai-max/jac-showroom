"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importVehicle } from "@/lib/admin/api";
import type { VehicleImportResult } from "@/lib/admin/api-types";

// "Importar vehículo": recibe el .zip que genera "Exportar" y crea un
// vehículo NUEVO en borrador. La subida va en partes y en base64 (FortiWeb +
// tope de Cloudflare — ver lib/admin/api.ts importVehicle).

type State =
  | { phase: "idle" }
  | { phase: "uploading"; fileName: string; percent: number }
  | { phase: "done"; result: VehicleImportResult };

const pill =
  "flex h-[42px] cursor-pointer items-center gap-2 rounded-full border border-[var(--adm-border-input)] bg-white px-5 text-[13px] font-semibold text-black transition-colors hover:border-black disabled:cursor-default disabled:opacity-50";

export function ImportVehicle() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const busy = state.phase === "uploading";

  async function onFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setState({ phase: "done", result: { ok: false, error: "Elige el archivo .zip exportado desde el panel." } });
      return;
    }
    setState({ phase: "uploading", fileName: file.name, percent: 0 });
    const result = await importVehicle(file, (percent) =>
      setState({ phase: "uploading", fileName: file.name, percent }),
    );
    setState({ phase: "done", result });
    if (result.ok) router.refresh();
  }

  return (
    <div className="relative">
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={pill}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        Importar vehículo
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onFile(file);
        }}
      />

      {state.phase !== "idle" ? (
        <div
          role="status"
          className="absolute right-0 top-[50px] z-10 flex w-[360px] max-w-[90vw] flex-col gap-3 rounded-[14px] border border-black bg-white p-[18px]"
        >
          {state.phase === "uploading" ? (
            <>
              <div className="truncate text-[13.5px] font-semibold">{state.fileName}</div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#efefef]">
                  <div className="h-full bg-black transition-all" style={{ width: `${state.percent}%` }} />
                </div>
                <span className="min-w-[90px] text-right text-xs font-bold">
                  {state.percent < 100 ? `Subiendo ${state.percent}%` : "Importando…"}
                </span>
              </div>
            </>
          ) : state.result.ok ? (
            <ImportDone result={state.result} onClose={() => setState({ phase: "idle" })} />
          ) : (
            <>
              <p role="alert" className="text-xs font-semibold text-[#b42318]">
                {state.result.error}
              </p>
              <button type="button" onClick={() => setState({ phase: "idle" })} className="h-8 cursor-pointer self-start rounded-full border border-[var(--adm-line)] bg-white px-3.5 text-xs font-semibold hover:border-black">
                Cerrar
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ImportDone({
  result,
  onClose,
}: {
  result: Extract<VehicleImportResult, { ok: true }>;
  onClose: () => void;
}) {
  return (
    <>
      <div className="text-[13.5px] font-semibold">Vehículo importado como borrador</div>
      <ul className="flex flex-col gap-1.5 text-xs text-[var(--adm-muted)]">
        {result.requestedSlug ? (
          <li>
            El slug «{result.requestedSlug}» ya existía: se creó como «{result.slug}».
          </li>
        ) : null}
        <li>
          {result.colorsQueued > 0
            ? `${result.colorsQueued} ${result.colorsQueued === 1 ? "color se está procesando" : "colores se están procesando"} en segundo plano (galería 360°).`
            : "Sin galerías 360° para procesar."}
        </li>
        {result.skippedScenarios.length > 0 ? (
          <li className="font-semibold text-[#b54708]">
            Escenarios omitidos (no existen en este entorno): {result.skippedScenarios.join(", ")}.
          </li>
        ) : null}
        {result.warnings.map((warning) => (
          <li key={warning} className="font-semibold text-[#b54708]">
            {warning}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Link
          href={`/admin/vehiculos/${result.id}`}
          className="flex h-8 items-center rounded-full bg-black px-3.5 text-xs font-semibold text-white no-underline hover:bg-[var(--adm-hover)]"
        >
          Abrir vehículo
        </Link>
        <button type="button" onClick={onClose} className="h-8 cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3.5 text-xs font-semibold hover:border-black">
          Cerrar
        </button>
      </div>
    </>
  );
}
