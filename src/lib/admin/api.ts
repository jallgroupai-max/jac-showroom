"use client";

import type { ActionResult, JsonFile, VehicleImportResult, ViewerPositionsPatch } from "./api-types";

// Cliente del panel: cada función refleja 1:1 la Server Action que sustituye
// (mismo nombre, misma firma, mismo ActionResult) para que los componentes
// solo cambien el import.
//
// Por qué existe (plan A7 — hotfix WAF): con `<form action={serverAction}>` o
// una action invocada desde el cliente, React serializa la llamada como
// multipart/form-data con campos `$ACTION_REF`, `$ACTION_1:0` y `$ACTION_KEY`.
// El firewall de producción (Citrix NetScaler AppFirewall) trata todo
// parámetro que empieza con "$" como firma de inyección NoSQL y devuelve su
// página de bloqueo; React recibe HTML donde esperaba un payload RSC y muere
// con "An unexpected response was received from the server". Aquí todo viaja
// como JSON plano con nombres de campo normales.

const ERROR_NETWORK = "No se pudo conectar con el servidor. Intenta de nuevo.";
const ERROR_RESPONSE = "El servidor devolvió una respuesta inesperada.";

async function post<T extends ActionResult>(path: string, payload: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: ERROR_NETWORK } as T;
  }

  // Si algo intermedio (proxy, WAF, balanceador) responde HTML en vez del
  // JSON del handler, esto lo convierte en un error legible en pantalla en
  // lugar de una excepción sin contexto en consola.
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object" && "ok" in data) return data as T;
  return { ok: false, error: response.ok ? ERROR_RESPONSE : `Error ${response.status}.` } as T;
}

/** Lee un File/Blob a base64 sin cargarlo por trozos a mano: FileReader
 * soporta archivos grandes, a diferencia de btoa(String.fromCharCode(...)). */
export function encodeFile(blob: Blob, name: string): Promise<JsonFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve({
        name,
        type: blob.type,
        data: result.slice(result.indexOf(",") + 1),
      });
    };
    reader.readAsDataURL(blob);
  });
}

/** Base64 por trozos de 3MB (múltiplo de 3: ningún trozo lleva "=" en medio,
 * así que se concatenan tal cual) para no armar un único string del tamaño del
 * archivo. Va en base64 porque el FortiWeb de jacvenezuela bloquea los bytes
 * binarios de PNG/ZIP — ver src/lib/base64-stream.ts. */
export async function toBase64Blob(file: Blob, name = "archivo"): Promise<Blob> {
  const CHUNK = 3 * 1024 * 1024;
  const parts: string[] = [];
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    parts.push((await encodeFile(file.slice(offset, offset + CHUNK), name)).data);
  }
  return new Blob(parts, { type: "text/plain" });
}

/** Convierte un FormData en el objeto JSON equivalente — los archivos pasan a
 * { name, type, data:base64 }. Permite conservar los <form> y los FormData que
 * ya armaban los componentes sin reescribir su lógica. */
async function toJson(formData: FormData): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    payload[key] =
      value instanceof Blob
        ? await encodeFile(value, value instanceof File ? value.name : key)
        : value;
  }
  return payload;
}

// ————————————————————————————————————————————————————————————————
// Sesión
// ————————————————————————————————————————————————————————————————

export function logout(): Promise<ActionResult> {
  return post("/api/admin/session/logout", {});
}

// ————————————————————————————————————————————————————————————————
// Cuenta
// ————————————————————————————————————————————————————————————————

export async function updateOwnProfile(formData: FormData): Promise<ActionResult> {
  return post("/api/admin/account/profile", await toJson(formData));
}

export async function changeOwnPassword(formData: FormData): Promise<ActionResult> {
  return post("/api/admin/account/password", await toJson(formData));
}

// ————————————————————————————————————————————————————————————————
// Escenarios (catálogo global)
// ————————————————————————————————————————————————————————————————

export async function createScenario(formData: FormData): Promise<ActionResult> {
  return post("/api/admin/scenarios/create", await toJson(formData));
}

export function deleteScenario(scenarioId: string, force: boolean): Promise<ActionResult> {
  return post("/api/admin/scenarios/delete", { scenarioId, force });
}

// ————————————————————————————————————————————————————————————————
// Categorías de vehículo
// ————————————————————————————————————————————————————————————————

export async function createCategory(formData: FormData): Promise<ActionResult> {
  return post("/api/admin/categories/create", await toJson(formData));
}

export async function updateCategory(
  categoryId: string,
  formData: FormData,
): Promise<ActionResult> {
  return post("/api/admin/categories/update", { ...(await toJson(formData)), categoryId });
}

export function deleteCategory(categoryId: string): Promise<ActionResult> {
  return post("/api/admin/categories/delete", { categoryId });
}

export function moveCategory(categoryId: string, direction: "up" | "down"): Promise<ActionResult> {
  return post("/api/admin/categories/move", { categoryId, direction });
}

// ————————————————————————————————————————————————————————————————
// Catálogo de íconos (exterior / interior / general)
// ————————————————————————————————————————————————————————————————

export async function createHotspotIcon(formData: FormData): Promise<ActionResult> {
  return post("/api/admin/icons/create", await toJson(formData));
}

export async function updateHotspotIcon(
  iconId: string,
  formData: FormData,
): Promise<ActionResult> {
  return post("/api/admin/icons/update", { ...(await toJson(formData)), iconId });
}

export function deleteHotspotIcon(iconId: string): Promise<ActionResult> {
  return post("/api/admin/icons/delete", { iconId });
}

// ————————————————————————————————————————————————————————————————
// Leads
// ————————————————————————————————————————————————————————————————

export function retryLeadSync(leadId: string): Promise<ActionResult> {
  return post("/api/admin/leads/retry", { leadId });
}

export function deleteLead(leadId: string): Promise<ActionResult> {
  return post("/api/admin/leads/delete", { leadId });
}

// ————————————————————————————————————————————————————————————————
// Vehículos
// ————————————————————————————————————————————————————————————————

export type StatusAction = "pause" | "republish" | "archive";

export function createVehicle(vehicle: unknown): Promise<ActionResult> {
  return post("/api/admin/vehicles/create", { vehicle });
}

export function updateVehicleBasics(vehicleId: string, vehicle: unknown): Promise<ActionResult> {
  return post("/api/admin/vehicles/basics", { vehicleId, vehicle });
}

export async function saveVehicleCardImage(
  vehicleId: string,
  formData: FormData,
): Promise<ActionResult> {
  return post("/api/admin/vehicles/card-image", { vehicleId, ...(await toJson(formData)) });
}

export function removeVehicleCardImage(vehicleId: string): Promise<ActionResult> {
  return post("/api/admin/vehicles/card-image/remove", { vehicleId });
}

export function saveVehicleSpecs(vehicleId: string, specs: unknown): Promise<ActionResult> {
  return post("/api/admin/vehicles/specs", { vehicleId, specs });
}

export function saveVehicleViewerPositions(
  vehicleId: string,
  positions: ViewerPositionsPatch,
): Promise<ActionResult> {
  return post("/api/admin/vehicles/viewer-positions", { vehicleId, positions });
}

export function setVehicleStatus(vehicleId: string, action: StatusAction): Promise<ActionResult> {
  return post("/api/admin/vehicles/status", { vehicleId, action });
}

export function publishVehicle(vehicleId: string): Promise<ActionResult> {
  return post("/api/admin/vehicles/publish", { vehicleId });
}

export function getPreviewUrl(vehicleId: string): Promise<ActionResult & { url?: string }> {
  return post("/api/admin/vehicles/preview-url", { vehicleId });
}

export function moveVehicle(vehicleId: string, direction: "up" | "down"): Promise<ActionResult> {
  return post("/api/admin/vehicles/move", { vehicleId, direction });
}

export function toggleVehicleScenario(
  vehicleId: string,
  scenarioId: string,
  enabled: boolean,
): Promise<ActionResult> {
  return post("/api/admin/vehicles/scenario", { vehicleId, scenarioId, enabled });
}

export async function saveOwnBackground(
  vehicleId: string,
  formData: FormData,
): Promise<ActionResult> {
  return post("/api/admin/vehicles/background", { vehicleId, ...(await toJson(formData)) });
}

export function removeOwnBackground(vehicleId: string): Promise<ActionResult> {
  return post("/api/admin/vehicles/background/remove", { vehicleId });
}

// ————————————————————————————————————————————————————————————————
// Puntos de interés
// ————————————————————————————————————————————————————————————————

export async function saveExteriorPoi(
  vehicleId: string,
  formData: FormData,
): Promise<ActionResult> {
  return post("/api/admin/vehicles/poi/exterior", { vehicleId, ...(await toJson(formData)) });
}

export async function saveInteriorPoi(
  vehicleId: string,
  formData: FormData,
): Promise<ActionResult> {
  return post("/api/admin/vehicles/poi/interior", { vehicleId, ...(await toJson(formData)) });
}

export function deletePoi(vehicleId: string, poiId: string): Promise<ActionResult> {
  return post("/api/admin/vehicles/poi/delete", { vehicleId, poiId });
}

// ————————————————————————————————————————————————————————————————
// Exportar / importar un vehículo completo (.zip)
// ————————————————————————————————————————————————————————————————

/** Descarga directa (GET binario en streaming): basta un <a href download>. */
export function exportVehicleUrl(vehicleId: string): string {
  return `/api/admin/vehicles/${vehicleId}/export`;
}

// Partes de ≤ 45MB: en base64 son ~60MB, bajo el tope de 100MB por request de
// Cloudflare (un vehículo completo lo supera con holgura). El servidor las
// concatena en streaming a disco (src/lib/admin/vehicle-package/chunked-upload.ts).
const IMPORT_PART_BYTES = 45 * 1024 * 1024;
const PART_RETRIES = 2;

function putPart(
  uploadId: string,
  part: number,
  body: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/admin/uploads?uploadId=${uploadId}&part=${part}&encoding=base64`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Fallo al subir (${xhr.status}).`;
      try {
        message = JSON.parse(xhr.responseText).error ?? message;
      } catch {
        // respuesta no JSON (WAF/proxy): se queda el mensaje con el estado HTTP
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Fallo de red durante la subida."));
    xhr.send(body);
  });
}

/** Sube el .zip en partes (base64, ver toBase64Blob) y dispara la importación.
 * `onProgress` recibe 0–100 de la SUBIDA; el POST final puede tardar unos
 * segundos más (el servidor valida y escribe). */
export async function importVehicle(
  file: File,
  onProgress: (percent: number) => void,
): Promise<VehicleImportResult> {
  const uploadId = crypto.randomUUID();
  const parts = Math.max(1, Math.ceil(file.size / IMPORT_PART_BYTES));
  try {
    for (let part = 0; part < parts; part++) {
      const slice = file.slice(part * IMPORT_PART_BYTES, (part + 1) * IMPORT_PART_BYTES);
      const body = await toBase64Blob(slice, file.name);
      for (let attempt = 0; ; attempt++) {
        try {
          await putPart(uploadId, part, body, (fraction) =>
            onProgress(Math.round(((part * IMPORT_PART_BYTES + fraction * slice.size) / file.size) * 100)),
          );
          break;
        } catch (error) {
          // Reintento solo ante fallo de red: la parte N se sobrescribe sin riesgo.
          const network = error instanceof Error && error.message.startsWith("Fallo de red");
          if (!network || attempt >= PART_RETRIES) throw error;
        }
      }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Fallo al subir el archivo." };
  }
  onProgress(100);
  return post<VehicleImportResult>("/api/admin/vehicles/import", { uploadId, parts });
}
