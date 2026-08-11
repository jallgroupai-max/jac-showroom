// Primitivos de storage — modo dual: S3-compatible (Railway Bucket / R2) si
// S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY están
// definidas, disco local (uploads-data/) si no. Plain ESM (sin sintaxis TS)
// a propósito: tanto src/lib/storage.ts (Next, vía su wrapper tipado) como
// worker/*.mjs (Node plano, sin bundler/transpiler) lo importan directamente
// por ruta relativa — Node no puede `import` un .ts sin loader, y este repo
// no tiene uno.

import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, writeFile, unlink, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;

const REQUIRED_S3_VARS = { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY };
const definedCount = Object.values(REQUIRED_S3_VARS).filter(Boolean).length;
if (definedCount > 0 && definedCount < 4) {
  throw new Error(
    `Configuración S3 incompleta — definí las 4 variables (${Object.keys(REQUIRED_S3_VARS).join(", ")}) o ninguna (modo disco local).`,
  );
}

/** true si hay credenciales S3 completas — false = disco local (uploads-data/). */
export const S3_MODE = definedCount === 4;

/** Solo tiene sentido en modo disco local. */
export const UPLOADS_ROOT = path.join(process.cwd(), "uploads-data");

// Anti path-traversal — la clave nunca puede escapar de su raíz, en ningún modo.
export function normalizeKey(key) {
  const normalized = path.posix.normalize(key.replaceAll("\\", "/"));
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error(`Clave de storage inválida: ${key}`);
  }
  return normalized;
}

/** Clave temporal para una subida grande (ZIP de color). */
export function newTmpKey(extension) {
  return `tmp/${crypto.randomUUID()}.${extension.replace(/^\./, "")}`;
}

const CONTENT_TYPES = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".zip": "application/zip",
};

function contentTypeFor(key) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()];
}

// ————————————————————————————————————————————————————————————————
// Cliente S3 — construcción perezosa (una sola vez) y solo si S3_MODE.
// ————————————————————————————————————————————————————————————————

let s3 = null; // { client, mod }

async function getS3() {
  if (!s3) {
    const mod = await import("@aws-sdk/client-s3");
    const client = new mod.S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION || "auto",
      // Requerido por endpoints S3-compatibles de terceros (Railway Buckets,
      // R2, MinIO...) — sin esto el SDK arma URLs virtual-hosted que estos
      // proveedores no resuelven igual que AWS.
      forcePathStyle: true,
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    });
    s3 = { client, mod };
  }
  return s3;
}

function isNotFound(err) {
  return err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey";
}

// ————————————————————————————————————————————————————————————————
// API pública — modo dual. `key` es SIEMPRE relativo (sin "/uploads/"
// adelante); las funciones que reciben una URL pública completa lo dicen
// explícitamente en su nombre/comentario.
// ————————————————————————————————————————————————————————————————

/** Guarda un buffer bajo la clave dada y devuelve su URL pública. */
export async function saveObject(key, data) {
  const safeKey = normalizeKey(key);
  if (S3_MODE) {
    const { client, mod } = await getS3();
    await client.send(
      new mod.PutObjectCommand({ Bucket: S3_BUCKET, Key: safeKey, Body: data, ContentType: contentTypeFor(safeKey) }),
    );
  } else {
    const filePath = path.join(UPLOADS_ROOT, safeKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }
  return `/uploads/${safeKey}`;
}

/** Guarda un stream (body de un request) bajo la clave dada, SIN cargarlo
 * entero en memoria — en S3 vía multipart (`@aws-sdk/lib-storage`), en disco
 * vía streaming directo a archivo. */
export async function saveObjectStream(key, webStream) {
  const safeKey = normalizeKey(key);
  const nodeStream = Readable.fromWeb(webStream);
  if (S3_MODE) {
    const { client } = await getS3();
    const { Upload } = await import("@aws-sdk/lib-storage");
    const upload = new Upload({
      client,
      params: { Bucket: S3_BUCKET, Key: safeKey, Body: nodeStream, ContentType: contentTypeFor(safeKey) },
    });
    await upload.done();
  } else {
    const filePath = path.join(UPLOADS_ROOT, safeKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await pipeline(nodeStream, createWriteStream(filePath));
  }
  return `/uploads/${safeKey}`;
}

/** Lee un objeto por su clave — null si no existe. Para servirlo por HTTP
 * (route handler) o para bajarlo a un archivo local (worker). */
export async function getObjectStream(key) {
  const safeKey = normalizeKey(key);
  if (S3_MODE) {
    const { client, mod } = await getS3();
    try {
      const result = await client.send(new mod.GetObjectCommand({ Bucket: S3_BUCKET, Key: safeKey }));
      return { stream: result.Body.transformToWebStream(), contentLength: result.ContentLength ?? null };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }
  const filePath = path.join(UPLOADS_ROOT, safeKey);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    return { stream: Readable.toWeb(createReadStream(filePath)), contentLength: info.size };
  } catch {
    return null;
  }
}

/** true si el objeto existe — usado para confirmar que una subida en
 * streaming realmente llegó antes de encolar un job sobre ella. */
export async function objectExists(key) {
  const safeKey = normalizeKey(key);
  if (S3_MODE) {
    const { client, mod } = await getS3();
    try {
      await client.send(new mod.HeadObjectCommand({ Bucket: S3_BUCKET, Key: safeKey }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }
  try {
    const info = await stat(path.join(UPLOADS_ROOT, safeKey));
    return info.isFile();
  } catch {
    return false;
  }
}

/** Elimina un objeto por su URL PÚBLICA (ignora los que ya no existen o no
 * son nuestros). */
export async function deleteObject(publicUrl) {
  if (!publicUrl.startsWith("/uploads/")) return;
  const key = normalizeKey(publicUrl.slice("/uploads/".length));
  if (S3_MODE) {
    const { client, mod } = await getS3();
    try {
      await client.send(new mod.DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    } catch {
      // Ya no existe o error transitorio — el resultado deseado es el mismo.
    }
    return;
  }
  try {
    await unlink(path.join(UPLOADS_ROOT, key));
  } catch {
    // Ya no existe: el resultado deseado es el mismo.
  }
}

/** Elimina TODOS los objetos bajo un prefijo (URL PÚBLICA de una "carpeta" —
 * p. ej. un set de sprites completo). Pagina y trocea en lotes de 1000 —
 * límite duro de DeleteObjectsCommand. */
export async function deleteObjectsByPrefix(publicUrl) {
  if (!publicUrl.startsWith("/uploads/")) return;
  const prefix = normalizeKey(publicUrl.slice("/uploads/".length));
  if (S3_MODE) {
    const { client, mod } = await getS3();
    const keys = [];
    for await (const page of mod.paginateListObjectsV2({ client }, { Bucket: S3_BUCKET, Prefix: `${prefix}/` })) {
      for (const obj of page.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    }
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await client.send(
        new mod.DeleteObjectsCommand({ Bucket: S3_BUCKET, Delete: { Objects: batch.map((Key) => ({ Key })) } }),
      );
    }
    return;
  }
  await rm(path.join(UPLOADS_ROOT, prefix), { recursive: true, force: true });
}
