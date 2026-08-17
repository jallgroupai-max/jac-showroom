"use client";

import type { ActionResult, JsonFile } from "./api-types";

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
function encodeFile(blob: Blob, name: string): Promise<JsonFile> {
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
// Leads
// ————————————————————————————————————————————————————————————————

export function retryLeadSync(leadId: string): Promise<ActionResult> {
  return post("/api/admin/leads/retry", { leadId });
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
