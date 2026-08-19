"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Paso 3 — Galería 360° por color (plan §2.3/§2.4, prototipo "Galería 360°"):
// dropzone de ZIP, una fila por color con estado vivo del pipeline, y las dos
// acciones de recuperación según el tipo de fallo: Reintentar (transitorio) o
// Reemplazar archivo (validación).

type JobInfo = {
  id: string;
  status: "QUEUED" | "EXTRACTING" | "COMPRESSING" | "DONE" | "ERROR";
  progress: number;
  errorMessage: string | null;
  errorKind: "TRANSIENT" | "VALIDATION" | null;
  attempts: number;
  queuePosition: number | null;
};

export type GalleryColor = {
  id: string;
  colorName: string;
  colorHex: string;
  frameCount: number;
  spriteBasePath: string | null;
  profileImageUrl: string | null;
  job: JobInfo | null;
};

/** Subida local aún sin confirmar (el usuario está poniendo nombre/color). */
type PendingUpload = {
  file: File;
  colorName: string;
  colorHex: string;
  /** Si reemplaza un color existente (validación fallida), su id. */
  replaceColorId: string | null;
  uploadPercent: number | null; // null = todavía no enviado
  error: string | null;
};

const ACTIVE_STATUSES = new Set(["QUEUED", "EXTRACTING", "COMPRESSING"]);

export function Step3Gallery({
  vehicleId,
  colors,
}: {
  vehicleId: string;
  colors: GalleryColor[];
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Record<string, JobInfo>>(() =>
    Object.fromEntries(colors.filter((c) => c.job).map((c) => [c.id, c.job as JobInfo])),
  );
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceForRef = useRef<string | null>(null);

  // Un .zip a la vez: mientras uno se está transfiriendo no se puede elegir
  // otro. No bloquea la COLA —encolar cinco colores es normal (§2.3)— solo la
  // transferencia: dos subidas de 100MB+ en paralelo se reparten el mismo
  // ancho de banda y ninguna acaba antes. En cuanto el archivo termina de
  // subir y el job queda encolado, la zona vuelve a habilitarse.
  const isUploading = pending !== null && pending.uploadPercent !== null;

  // — Polling de jobs activos (plan §2.3 paso 4). Un solo intervalo para
  //   todas las filas; se corta solo cuando no queda nada procesándose.
  const activeJobIds = Object.values(jobs)
    .filter((j) => ACTIVE_STATUSES.has(j.status))
    .map((j) => j.id);
  const activeKey = activeJobIds.join(",");

  useEffect(() => {
    if (!activeKey) return;
    const interval = setInterval(async () => {
      let someoneFinished = false;
      for (const jobId of activeKey.split(",")) {
        const res = await fetch(`/api/admin/jobs/${jobId}`);
        if (!res.ok) continue;
        const info: JobInfo = await res.json();
        setJobs((prev) => {
          const entry = Object.entries(prev).find(([, j]) => j.id === info.id);
          return entry ? { ...prev, [entry[0]]: info } : prev;
        });
        if (info.status === "DONE") someoneFinished = true;
      }
      if (someoneFinished) router.refresh(); // trae spriteBasePath/profile del servidor
    }, 1500);
    return () => clearInterval(interval);
  }, [activeKey, router]);

  // — Selección de archivo (alta nueva o reemplazo).
  const onFileChosen = useCallback((file: File, replaceColorId: string | null) => {
    // Última barrera del cliente: cubre a la vez el input, el drag & drop y el
    // botón "Reemplazar archivo", sin repetir la condición en cada uno.
    if (isUploading) return;
    const replaced = replaceColorId ? colors.find((c) => c.id === replaceColorId) : null;
    setPending({
      file,
      colorName: replaced?.colorName ?? guessColorName(file.name),
      colorHex: replaced?.colorHex ?? "#FFFFFF",
      replaceColorId,
      uploadPercent: null,
      error: null,
    });
     
  }, [colors, isUploading]);

  // — Subir + confirmar (§2.3 pasos 1-2): XHR para tener progreso real de
  //   subida; luego POST confirma y encola.
  async function startUpload() {
    if (!pending) return;
    if (!pending.colorName.trim()) {
      setPending((p) => (p ? { ...p, error: "Ponle nombre al color antes de subir." } : p));
      return;
    }
    setPending((p) => (p ? { ...p, uploadPercent: 0, error: null } : p));

    try {
      const key = await uploadWithProgress(pending.file, (percent) =>
        setPending((p) => (p ? { ...p, uploadPercent: percent } : p)),
      );
      const res = await fetch(`/api/admin/vehicles/${vehicleId}/colors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colorName: pending.colorName.trim(),
          colorHex: pending.colorHex,
          key,
          replaceColorId: pending.replaceColorId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo confirmar la subida");

      setJobs((prev) => ({
        ...prev,
        [data.colorId]: {
          id: data.jobId,
          status: "QUEUED",
          progress: 0,
          errorMessage: null,
          errorKind: null,
          attempts: 0,
          queuePosition: null,
        },
      }));
      setPending(null);
      router.refresh();
    } catch (error) {
      setPending((p) =>
        p ? { ...p, uploadPercent: null, error: error instanceof Error ? error.message : "Fallo al subir" } : p,
      );
    }
  }

  async function retryJob(colorId: string, jobId: string) {
    setRowError(null);
    const res = await fetch(`/api/admin/jobs/${jobId}/retry`, { method: "POST" });
    if (!res.ok) {
      setRowError((await res.json()).error ?? "No se pudo reintentar");
      return;
    }
    setJobs((prev) => ({
      ...prev,
      [colorId]: { ...prev[colorId], status: "QUEUED", progress: 0, errorMessage: null },
    }));
  }

  async function deleteColor(colorId: string) {
    setRowError(null);
    const res = await fetch(`/api/admin/vehicles/${vehicleId}/colors/${colorId}`, { method: "DELETE" });
    if (!res.ok) {
      setRowError((await res.json()).error ?? "No se pudo eliminar");
      return;
    }
    setJobs((prev) => {
      const next = { ...prev };
      delete next[colorId];
      return next;
    });
    router.refresh();
  }

  async function renameColor(colorId: string, colorName: string) {
    if (!colorName.trim()) return;
    await fetch(`/api/admin/vehicles/${vehicleId}/colors/${colorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colorName: colorName.trim() }),
    });
    router.refresh();
  }

  return (
    <div className="flex max-w-[1080px] flex-col gap-[30px]">
      <div>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">Galería 360° por color</h2>
        <p className="text-sm text-[var(--adm-muted)]">
          Un .zip por color, con 36 imágenes secuenciales nombradas 001–036 (10° por
          fotograma). El servidor deriva las tres calidades — se procesa en segundo plano y
          puedes salir sin perder nada.
        </p>
      </div>

      {/* Dropzone */}
      <label
        aria-disabled={isUploading}
        className={`flex flex-col items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] p-[38px] ${
          isUploading
            ? "pointer-events-none opacity-50"
            : "cursor-pointer hover:border-black hover:bg-white"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) onFileChosen(file, null);
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        <span className="text-[15px] font-semibold">Arrastra el .zip o haz clic para seleccionar</span>
        <span className="text-[12.5px] text-[var(--adm-faint)]">
          {isUploading
            ? "Hay una subida en curso — espera a que termine para subir otro .zip"
            : "ZIP · 36 archivos .png o .jpg nombrados 001–036 · un solo color por archivo"}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileChosen(file, replaceForRef.current);
            replaceForRef.current = null;
            e.target.value = "";
          }}
        />
      </label>

      {/* Alta pendiente: nombre + color + subir */}
      {pending ? (
        <div className="flex flex-col gap-3.5 rounded-[14px] border border-black p-[18px]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold">{pending.file.name}</div>
              <div className="text-[11.5px] text-[var(--adm-fainter)]">
                {formatBytes(pending.file.size)}
                {pending.replaceColorId ? " · reemplaza el archivo anterior" : ""}
              </div>
            </div>
            {pending.uploadPercent === null ? (
              <button
                type="button"
                onClick={() => setPending(null)}
                className="h-8 flex-none cursor-pointer rounded-full border border-[var(--adm-line)] bg-white px-3.5 text-xs font-semibold hover:border-black"
              >
                Cancelar
              </button>
            ) : null}
          </div>

          {pending.uploadPercent === null ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
                  Nombre del color
                </span>
                <input
                  value={pending.colorName}
                  onChange={(e) => setPending((p) => (p ? { ...p, colorName: e.target.value } : p))}
                  placeholder="Ej. Blanco Perla"
                  className="h-10 w-[220px] rounded-[10px] border border-[var(--adm-border-input)] bg-white px-3 text-[13px]"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
                  Muestra
                </span>
                <input
                  type="color"
                  value={pending.colorHex}
                  onChange={(e) => setPending((p) => (p ? { ...p, colorHex: e.target.value } : p))}
                  className="h-10 w-[64px] cursor-pointer rounded-[10px] border border-[var(--adm-border-input)] bg-white p-1"
                />
              </label>
              <button
                type="button"
                onClick={startUpload}
                className="h-10 cursor-pointer rounded-full bg-black px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--adm-hover)]"
              >
                Subir y procesar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#efefef]">
                <div className="h-full bg-black transition-all" style={{ width: `${pending.uploadPercent}%` }} />
              </div>
              <span className="min-w-[90px] text-right text-xs font-bold">
                Subiendo {pending.uploadPercent}%
              </span>
            </div>
          )}

          {pending.error ? (
            <p role="alert" className="text-xs font-semibold text-[#b42318]">
              {pending.error}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Filas de colores */}
      {colors.length > 0 || Object.keys(jobs).length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1.4fr_1fr_0.9fr_44px] gap-4 px-[18px] text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--adm-fainter)]">
            <span>Color</span>
            <span>Estado</span>
            <span>Imágenes</span>
            <span />
          </div>

          {colors.map((color) => {
            const job = jobs[color.id] ?? color.job;
            const isActive = job ? ACTIVE_STATUSES.has(job.status) : false;
            const isReady = color.spriteBasePath !== null && !isActive;

            return (
              <div key={color.id} className="rounded-[14px] border border-[var(--adm-line)] px-[18px] py-3.5">
                <div className="grid grid-cols-[1.4fr_1fr_0.9fr_44px] items-center gap-4">
                  {/* Color: swatch + nombre editable + miniatura si está lista */}
                  <div className="flex min-w-0 items-center gap-3">
                    {color.profileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={color.profileImageUrl}
                        alt={color.colorName}
                        className="h-10 w-14 flex-none rounded-[8px] border border-[var(--adm-line)] object-cover"
                      />
                    ) : (
                      <span
                        className="h-[22px] w-[22px] flex-none rounded-full border border-[#cfcfcf]"
                        style={{ background: color.colorHex }}
                      />
                    )}
                    <input
                      defaultValue={color.colorName}
                      onBlur={(e) => {
                        if (e.target.value !== color.colorName) renameColor(color.id, e.target.value);
                      }}
                      className="h-9 w-full min-w-0 rounded-[9px] border border-transparent bg-transparent px-2 text-[13.5px] font-semibold hover:border-[var(--adm-border-input)] focus:border-black"
                    />
                  </div>

                  {/* Estado */}
                  <JobStateCell job={job} isReady={isReady} />

                  {/* Badge N/36 */}
                  <div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-[5px] text-[11.5px] font-bold tracking-[0.04em] ${
                        isReady
                          ? "bg-black text-white"
                          : "border border-[var(--adm-border-input)] bg-white text-[var(--adm-faint)]"
                      }`}
                    >
                      {isReady ? `${color.frameCount}/36` : "—/36"}
                    </span>
                  </div>

                  {/* Eliminar */}
                  <button
                    type="button"
                    onClick={() => deleteColor(color.id)}
                    disabled={isActive}
                    aria-label={`Eliminar ${color.colorName}`}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--adm-line)] bg-white hover:border-black disabled:opacity-40"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>

                {/* Progreso / error accionable (§2.4) */}
                {job && isActive ? (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#efefef]">
                      <div className="h-full bg-black transition-all" style={{ width: `${job.progress}%` }} />
                    </div>
                    <span className="text-[11.5px] font-semibold text-[var(--adm-faint)]">
                      {stateLabel(job)}
                    </span>
                  </div>
                ) : null}

                {job?.status === "ERROR" ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[#fef3f2] px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-[#b42318]">{job.errorMessage}</span>
                    <div className="flex gap-2">
                      {job.errorKind !== "VALIDATION" ? (
                        <button
                          type="button"
                          onClick={() => retryJob(color.id, job.id)}
                          className="h-8 cursor-pointer rounded-full border border-black bg-white px-3.5 text-xs font-semibold hover:bg-black hover:text-white"
                        >
                          Reintentar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => {
                          replaceForRef.current = color.id;
                          fileInputRef.current?.click();
                        }}
                        className="h-8 cursor-pointer rounded-full bg-black px-3.5 text-xs font-semibold text-white hover:bg-[var(--adm-hover)] disabled:cursor-default disabled:opacity-40"
                      >
                        Reemplazar archivo
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {rowError ? (
        <p role="alert" className="text-xs font-semibold text-[#b42318]">
          {rowError}
        </p>
      ) : null}
    </div>
  );
}

function JobStateCell({ job, isReady }: { job: JobInfo | null; isReady: boolean }) {
  if (isReady) {
    return <span className="text-[12.5px] font-semibold text-[#067647]">Listo — 3 calidades derivadas</span>;
  }
  if (!job) {
    return <span className="text-[12.5px] text-[var(--adm-fainter)]">Sin galería</span>;
  }
  if (job.status === "ERROR") {
    return (
      <span className="text-[12.5px] font-semibold text-[#b42318]">
        {job.errorKind === "VALIDATION" ? "Archivo inválido" : "Fallo de proceso"}
      </span>
    );
  }
  return <span className="text-[12.5px] font-semibold">{stateLabel(job)}</span>;
}

function stateLabel(job: JobInfo): string {
  switch (job.status) {
    case "QUEUED":
      return job.queuePosition && job.queuePosition > 1
        ? `En cola (${job.queuePosition}.º)`
        : "En cola…";
    case "EXTRACTING":
      return "Extrayendo…";
    case "COMPRESSING":
      return `Comprimiendo ${job.progress}%`;
    case "DONE":
      return "Listo";
    default:
      return "";
  }
}

/** PUT con XHR — fetch aún no expone progreso de subida. */
function uploadWithProgress(file: File, onProgress: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/admin/uploads?filename=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.key) resolve(data.key);
        else reject(new Error(data.error ?? `Fallo al subir (${xhr.status})`));
      } catch {
        reject(new Error(`Fallo al subir (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Fallo de red durante la subida"));
    xhr.send(file);
  });
}

/** "ELITE_SEDAN_BLANCO_360.zip" → sugerencia "Blanco". */
function guessColorName(fileName: string): string {
  const known = ["blanco", "negro", "gris", "rojo", "azul", "plata", "verde", "beige", "marron"];
  const lower = fileName.toLowerCase();
  const hit = known.find((color) => lower.includes(color));
  return hit ? hit.charAt(0).toUpperCase() + hit.slice(1) : "";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
