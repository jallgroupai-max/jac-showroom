import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UPLOADS_ROOT } from "@/lib/storage";

// Subida de un archivo grande en PARTES (paquete de vehículo). Un vehículo
// completo supera el tope de 100MB por request de Cloudflare — y en base64
// pesa ~33% más —, así que el cliente manda varios PUT de ≤ ~50MB
// (/api/admin/uploads?uploadId=…&part=N). Cada parte se escribe en streaming
// a su propio archivo en disco local (nunca en memoria): un reintento de la
// parte N simplemente la sobrescribe. Al confirmar, assembleParts() las
// concatena en orden, también en streaming, borrando cada parte al terminar de
// copiarla. Vive en disco local aunque el storage de assets sea S3:
// unzipper solo sabe leer de disco, y así no se sube ni baja el zip del bucket.
// Requiere que los PUT y el POST de importación lleguen a la MISMA instancia
// (hoy es una sola; con réplicas habría que pasar a almacenamiento compartido).

export const MAX_PARTS = 48;
/** Tope duro de una parte YA decodificada (el cliente manda ≤ ~48MB). */
export const MAX_PART_BYTES = 64 * 1024 ** 2;
const STALE_MS = 24 * 3600_000;
const ROOT = path.join(UPLOADS_ROOT, "tmp", "import-parts");

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PartError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Valida el uploadId que manda el cliente — nunca se arma una ruta con algo que no sea un UUID. */
function dirOf(uploadId: string): string {
  if (!ID.test(uploadId)) throw new PartError("uploadId inválido");
  return path.join(ROOT, uploadId.toLowerCase());
}

export async function savePart(uploadId: string, part: number, body: ReadableStream<Uint8Array>): Promise<void> {
  if (!Number.isInteger(part) || part < 0 || part >= MAX_PARTS) throw new PartError("Número de parte inválido");
  const dir = dirOf(uploadId);
  if (part === 0) await sweepStale();
  await mkdir(dir, { recursive: true });

  const target = path.join(dir, `${part}.part`);
  let bytes = 0;
  try {
    await pipeline(
      Readable.fromWeb(body as import("node:stream/web").ReadableStream),
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          bytes += chunk.length;
          if (bytes > MAX_PART_BYTES) throw new PartError("La parte es demasiado grande", 413);
          yield chunk;
        }
      },
      createWriteStream(target),
    );
  } catch (error) {
    await unlink(target).catch(() => {});
    throw error;
  }
  if (bytes === 0) {
    await unlink(target).catch(() => {});
    throw new PartError("Parte vacía");
  }
}

/** Concatena las partes 0..parts-1 en un solo archivo y devuelve su ruta. */
export async function assembleParts(uploadId: string, parts: number): Promise<string> {
  if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS) throw new PartError("Cantidad de partes inválida");
  const dir = dirOf(uploadId);
  const partPath = (i: number) => path.join(dir, `${i}.part`);
  for (let i = 0; i < parts; i++) {
    const info = await stat(partPath(i)).catch(() => null);
    if (!info?.isFile()) throw new PartError(`La subida está incompleta: falta la parte ${i + 1} de ${parts}. Vuelve a subir el archivo.`);
  }

  const target = path.join(dir, "assembled.zip");
  async function* chunks() {
    for (let i = 0; i < parts; i++) {
      yield* createReadStream(partPath(i));
      await unlink(partPath(i)); // libera disco a medida que avanza
    }
  }
  await pipeline(Readable.from(chunks()), createWriteStream(target));
  return target;
}

/** Borra todo lo de una subida (partes + zip ensamblado). Nunca lanza. */
export async function discardUpload(uploadId: string): Promise<void> {
  try {
    await rm(dirOf(uploadId), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    // best-effort
  }
}

/** Subidas abandonadas (el usuario cerró la pestaña a media subida): fuera tras 24h. */
async function sweepStale(): Promise<void> {
  try {
    const now = Date.now();
    for (const name of await readdir(ROOT)) {
      const dir = path.join(ROOT, name);
      const info = await stat(dir).catch(() => null);
      if (info && now - info.mtimeMs > STALE_MS) await rm(dir, { recursive: true, force: true });
    }
  } catch {
    // ROOT aún no existe o carrera con otro barrido: nada que limpiar
  }
}
