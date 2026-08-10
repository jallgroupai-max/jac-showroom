import { createWriteStream } from "node:fs";
import { mkdir, writeFile, unlink, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Capa de storage de assets del panel.
//
// Implementación A1: disco local bajo public/uploads/ — suficiente para
// desarrollo y para que la biblioteca de escenarios sea funcional ya. La
// Fase A2 la reemplaza por S3/R2 (presigned URLs, plan §2.3) cambiando SOLO
// este módulo: los llamadores usan claves relativas y URLs públicas, nunca
// rutas de disco.

// FUERA de public/: Next NO sirve archivos añadidos a public/ después del
// build (limitación documentada — en dev funciona y en producción 404).
// Los assets se sirven vía src/app/uploads/[...path]/route.ts, con la misma
// URL pública /uploads/*.
export const UPLOADS_ROOT = path.join(process.cwd(), "uploads-data");

/** Guarda un buffer bajo la clave dada y devuelve su URL pública. */
export async function saveUpload(key: string, data: Buffer): Promise<string> {
  const safeKey = normalizeKey(key);
  const filePath = path.join(UPLOADS_ROOT, safeKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
  return `/uploads/${safeKey}`;
}

/** Elimina un asset subido previamente (ignora los que ya no existen). */
export async function deleteUpload(publicUrl: string): Promise<void> {
  if (!publicUrl.startsWith("/uploads/")) return; // no es nuestro — no tocar
  const key = normalizeKey(publicUrl.slice("/uploads/".length));
  try {
    await unlink(path.join(UPLOADS_ROOT, key));
  } catch {
    // Ya no existe: el resultado deseado es el mismo.
  }
}

/** Clave temporal para una subida grande (ZIP de color). Vive en tmp/ hasta
 * que el job la consume o se descarta — "Reintentar" nunca vuelve a subir. */
export function newTmpUploadKey(extension: string): string {
  return `tmp/${crypto.randomUUID()}.${extension.replace(/^\./, "")}`;
}

/** Guarda un stream (body de un request) bajo la clave dada, SIN cargarlo en
 * memoria (§2.5 — es lo que permite no imponer límite de tamaño). Emulación
 * local del "presigned upload"; con S3/R2 este paso pasa a ser un PUT directo
 * del navegador al bucket y esta función desaparece del camino. */
export async function saveUploadStream(
  key: string,
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const safeKey = normalizeKey(key);
  const filePath = path.join(UPLOADS_ROOT, safeKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await pipeline(Readable.fromWeb(stream as import("node:stream/web").ReadableStream), createWriteStream(filePath));
  return `/uploads/${safeKey}`;
}

/** Ruta absoluta en disco de una clave — para validar existencia. */
export function uploadPathFor(key: string): string {
  return path.join(UPLOADS_ROOT, normalizeKey(key));
}

/** Elimina recursivamente un directorio de assets (p. ej. el set completo de
 * un color al eliminarlo). */
export async function deleteUploadDir(publicUrl: string): Promise<void> {
  if (!publicUrl.startsWith("/uploads/")) return;
  const key = normalizeKey(publicUrl.slice("/uploads/".length));
  await rm(path.join(UPLOADS_ROOT, key), { recursive: true, force: true });
}

// Anti path-traversal: la clave nunca puede escapar de public/uploads.
function normalizeKey(key: string): string {
  const normalized = path.posix.normalize(key.replaceAll("\\", "/"));
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error(`Clave de storage inválida: ${key}`);
  }
  return normalized;
}
