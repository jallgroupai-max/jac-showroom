import {
  saveObject,
  saveObjectStream,
  getObjectStream,
  deleteObject,
  deleteObjectsByPrefix,
  objectExists,
  newTmpKey,
  UPLOADS_ROOT as ROOT,
} from "./storage-engine.mjs";

// Capa de storage de assets del panel — wrapper tipado sobre
// storage-engine.mjs (plain ESM: worker/*.mjs lo importa directamente, sin
// pasar por TypeScript). Modo dual ahí adentro: disco local si no hay
// variables S3_*, bucket S3-compatible (Railway Buckets / R2) si las hay —
// los llamadores de acá nunca lo notan, siguen recibiendo/pasando claves
// relativas y URLs públicas "/uploads/*".

/** Solo tiene sentido en modo disco local (debug/inspección). */
export const UPLOADS_ROOT: string = ROOT;

/** Guarda un buffer bajo la clave dada y devuelve su URL pública. */
export async function saveUpload(key: string, data: Buffer): Promise<string> {
  return saveObject(key, data);
}

/** Guarda un stream (body de un request) bajo la clave dada, SIN cargarlo en
 * memoria (§2.5 — es lo que permite no imponer límite de tamaño). */
export async function saveUploadStream(key: string, stream: ReadableStream<Uint8Array>): Promise<string> {
  return saveObjectStream(key, stream);
}

/** Elimina un asset subido previamente (ignora los que ya no existen). */
export async function deleteUpload(publicUrl: string): Promise<void> {
  return deleteObject(publicUrl);
}

/** Elimina recursivamente un directorio de assets (p. ej. el set completo de
 * un color al eliminarlo). */
export async function deleteUploadDir(publicUrl: string): Promise<void> {
  return deleteObjectsByPrefix(publicUrl);
}

/** Clave temporal para una subida grande (ZIP de color). Vive en tmp/ hasta
 * que el job la consume o se descarta — "Reintentar" nunca vuelve a subir nada. */
export function newTmpUploadKey(extension: string): string {
  return newTmpKey(extension);
}

/** true si la clave existe — confirma que una subida en streaming realmente
 * llegó antes de encolar un job sobre ella. */
export async function uploadExists(key: string): Promise<boolean> {
  return objectExists(key);
}

/** Lee un asset por su clave — null si no existe. Para servirlo por HTTP
 * (route handler de /uploads/*). */
export async function readUpload(
  key: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentLength: number | null } | null> {
  return getObjectStream(key);
}
