// Pipeline de un ZIP de color (plan §2.3): extraer en streaming, validar 36
// fotogramas, derivar LOW/MEDIUM/HIGH en WebP, publicar y limpieza. Cada
// paso es idempotente: si el worker muere a la mitad, re-ejecutar el job
// desde cero produce el mismo resultado.
import { mkdir, rm, rename, readdir, stat, writeFile, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import unzipper from "unzipper"; // CJS — sin named exports en ESM
import sharp from "sharp";
import {
  S3_MODE,
  UPLOADS_ROOT,
  saveObject,
  deleteObject,
  deleteObjectsByPrefix,
  getObjectStream,
} from "../src/lib/storage-engine.mjs";

// Windows: sharp/libvips cachea descriptores de archivo — sin esto, los
// archivos de entrada quedan bloqueados (EBUSY) al intentar borrarlos.
sharp.cache(false);

// Targets calibrados contra recursos/QUALITYS (medidos: LOW 1806×925 ~40KB,
// MEDIUM 2500×1281 ~79KB, HIGH 2500×1281 ~142KB). HIGH y MEDIUM comparten
// resolución — cambia la compresión. ⚠️ Pesos de un prototipo (TRD §4.1):
// re-medir cuando lleguen assets de producción.
const QUALITY_TIERS = [
  { name: "low", maxWidth: 1806, webpQuality: 58 },
  { name: "medium", maxWidth: 2500, webpQuality: 64 },
  { name: "high", maxWidth: 2500, webpQuality: 82 },
];

const FRAME_COUNT = 36;
const PROFILE_FRAME = 25; // frame 3/4 del set — igual que mock-data.ts
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const UPLOAD_CONCURRENCY = 8;

export class ValidationError extends Error {
  name = "ValidationError";
}

export async function processColorZip(prisma, uploadJobId) {
  const job = await prisma.uploadJob.findUnique({
    where: { id: uploadJobId },
    include: { vehicleColor: { include: { vehicle: true } } },
  });
  if (!job) throw new Error(`UploadJob ${uploadJobId} no existe`);
  if (job.status === "DONE") return; // reentrega tras reinicio: nada que hacer
  const color = job.vehicleColor;
  if (!color) throw new ValidationError("El color de este trabajo ya no existe — súbelo de nuevo.");

  const setProgress = (status, progress) =>
    prisma.uploadJob.update({
      where: { id: uploadJobId },
      data: { status, progress, errorMessage: null, startedAt: job.startedAt ?? new Date() },
    });

  const workDir = path.join(UPLOADS_ROOT, "tmp", `job-${uploadJobId}`);
  const srcDir = path.join(workDir, "src");
  const outDir = path.join(workDir, "out");
  // Copia LOCAL del ZIP fuente para que unzipper (solo sabe leer de disco)
  // pueda abrirlo. En modo disco ya está ahí (mismo volumen que la web). En
  // modo S3 hay que bajarlo primero — se guarda FUERA de workDir a propósito:
  // el safeRm(workDir) de más abajo limpia cualquier extracción a medias de
  // un intento anterior, y esta copia debe sobrevivir a eso.
  const zipPath = S3_MODE
    ? path.join(UPLOADS_ROOT, "tmp", `job-${uploadJobId}-source.zip`)
    : publicUrlToPath(job.sourceUrl);

  try {
    await setProgress("EXTRACTING", 2);

    if (S3_MODE) {
      const sourceKey = job.sourceUrl.slice("/uploads/".length);
      const asset = await getObjectStream(sourceKey);
      if (!asset) throw new Error(`El ZIP fuente ya no está disponible en el bucket (${sourceKey}).`);
      await mkdir(path.dirname(zipPath), { recursive: true });
      await pipeline(Readable.fromWeb(asset.stream), createWriteStream(zipPath));
    }

    // — Abrir el ZIP (lee el directorio central; las entradas se streamean
    //   una a una a disco — el archivo nunca se carga entero en memoria §2.5).
    let zip;
    try {
      zip = await unzipper.Open.file(zipPath);
    } catch {
      throw new ValidationError("El archivo no es un ZIP válido o está corrupto.");
    }

    // — Validar: exactamente 36 imágenes numeradas 1..36 (§2.3).
    const frames = new Map(); // número → entrada
    const duplicates = new Set();
    for (const entry of zip.files) {
      if (entry.type !== "File") continue;
      const base = path.basename(entry.path);
      if (base.startsWith(".") || entry.path.includes("__MACOSX")) continue;
      const ext = path.extname(base).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      const match = base.match(/(\d+)\.[a-zA-Z]+$/);
      if (!match) continue;
      const num = Number(match[1]);
      if (num < 1 || num > FRAME_COUNT) continue;
      if (frames.has(num)) duplicates.add(num);
      frames.set(num, entry);
    }

    if (duplicates.size > 0) {
      throw new ValidationError(
        `Hay más de un archivo para ${duplicates.size === 1 ? "el fotograma" : "los fotogramas"} ${formatFrameList(duplicates)} — cada número debe aparecer una sola vez.`,
      );
    }
    const missing = [];
    for (let n = 1; n <= FRAME_COUNT; n++) if (!frames.has(n)) missing.push(n);
    if (missing.length > 0) {
      throw new ValidationError(
        missing.length === FRAME_COUNT
          ? "El ZIP no contiene imágenes numeradas — se esperan 36 archivos .png o .jpg nombrados 001–036."
          : `${missing.length === 1 ? "Falta el fotograma" : "Faltan los fotogramas"} ${formatFrameList(missing)} — el set debe tener 36.`,
      );
    }

    // — Extraer a disco, entrada por entrada. Cada frame se materializa en
    //   memoria individualmente (≤ unos MB) — la restricción de §2.5 es no
    //   cargar el ZIP COMPLETO, y eso sigue cumpliéndose.
    await safeRm(workDir);
    await mkdir(srcDir, { recursive: true });
    let extracted = 0;
    for (const [num, entry] of frames) {
      const dest = path.join(srcDir, `${String(num).padStart(4, "0")}${path.extname(entry.path).toLowerCase()}`);
      await writeFile(dest, await entry.buffer());
      extracted++;
      if (extracted % 6 === 0) {
        await setProgress("EXTRACTING", 2 + Math.round((extracted / FRAME_COUNT) * 8));
      }
    }

    // — Dimensiones consistentes entre los 36 (§2.3, error accionable).
    const srcFiles = (await readdir(srcDir)).sort();
    const firstMeta = await sharp(path.join(srcDir, srcFiles[0])).metadata();
    for (const file of srcFiles) {
      const meta = await sharp(path.join(srcDir, file)).metadata();
      if (meta.width !== firstMeta.width || meta.height !== firstMeta.height) {
        throw new ValidationError(
          `El fotograma ${file.slice(0, 4)} mide ${meta.width}×${meta.height}, distinto del resto (${firstMeta.width}×${firstMeta.height}) — todos deben tener la misma resolución.`,
        );
      }
    }

    // — Derivar las 3 calidades (108 archivos).
    await setProgress("COMPRESSING", 12);
    const totalOps = srcFiles.length * QUALITY_TIERS.length;
    let done = 0;
    for (const tier of QUALITY_TIERS) {
      const tierDir = path.join(outDir, tier.name);
      await mkdir(tierDir, { recursive: true });
      for (const file of srcFiles) {
        const target = path.join(tierDir, `${file.slice(0, 4)}.webp`);
        let image = sharp(path.join(srcDir, file));
        if ((firstMeta.width ?? 0) > tier.maxWidth) {
          image = image.resize({ width: tier.maxWidth });
        }
        await image.webp({ quality: tier.webpQuality }).toFile(target);
        done++;
        if (done % 9 === 0) {
          await setProgress("COMPRESSING", 12 + Math.round((done / totalOps) * 80));
        }
      }
    }

    // — Publicar el set nuevo. En disco: swap atómico con rename — el
    //   showroom nunca ve un set a medio escribir. En S3 no hay rename
    //   atómico entre prefijos, así que se sube el set completo bajo un
    //   prefijo ÚNICO de este job y el límite atómico pasa a ser el commit
    //   de Postgres de más abajo (nada lee sprites hasta que la fila lo
    //   dice) — el prefijo anterior se limpia DESPUÉS de ese commit.
    await setProgress("COMPRESSING", 94);
    let spriteBasePath;
    const previousSpriteBasePath = color.spriteBasePath;
    if (S3_MODE) {
      const prefix = `models/${color.vehicle.slug}/${color.colorSlug}/${uploadJobId}`;
      const files = [];
      for (const tier of QUALITY_TIERS) {
        const tierDir = path.join(outDir, tier.name);
        for (const file of await readdir(tierDir)) {
          files.push({ localPath: path.join(tierDir, file), key: `${prefix}/${tier.name}/${file}` });
        }
      }
      await uploadInBatches(files, UPLOAD_CONCURRENCY);
      spriteBasePath = `/uploads/${prefix}`;
    } else {
      const finalDir = path.join(UPLOADS_ROOT, "models", color.vehicle.slug, color.colorSlug);
      const retiredDir = `${finalDir}.old-${uploadJobId}`;
      await mkdir(path.dirname(finalDir), { recursive: true });
      if (await exists(finalDir)) await rename(finalDir, retiredDir);
      await rename(outDir, finalDir);
      await safeRm(retiredDir);
      spriteBasePath = `/uploads/models/${color.vehicle.slug}/${color.colorSlug}`;
    }

    // — Registrar el resultado. profileImageUrl derivada del frame 25 LOW
    //   (plan §1.3) — la muestra siempre coincide con el color real.
    await prisma.$transaction([
      prisma.vehicleColor.update({
        where: { id: color.id },
        data: {
          spriteBasePath,
          frameCount: FRAME_COUNT,
          profileImageUrl: `${spriteBasePath}/low/${String(PROFILE_FRAME).padStart(4, "0")}.webp`,
          activeJobId: null,
        },
      }),
      prisma.uploadJob.update({
        where: { id: uploadJobId },
        data: { status: "DONE", progress: 100, errorMessage: null, finishedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: job.createdById,
          action: "process-color-zip",
          entityType: "VehicleColor",
          entityId: color.id,
          detail: { vehicle: color.vehicle.slug, color: color.colorSlug, frames: FRAME_COUNT },
        },
      }),
    ]);

    // Best-effort: el prefijo S3 que estaba en vivo antes de este job ya no
    // hace falta — nunca debe tumbar el job, lo nuevo ya se publicó.
    if (S3_MODE && previousSpriteBasePath && previousSpriteBasePath !== spriteBasePath) {
      await deleteObjectsByPrefix(previousSpriteBasePath).catch(() => {});
    }

    // — Limpieza: ZIP original y temporales (§2.3 — un job terminado no deja
    //   huérfanos). El ZIP solo se borra en éxito: mientras haya error queda
    //   disponible para "Reintentar" sin volver a subir (§2.4).
    await safeRm(workDir);
    if (S3_MODE) {
      await deleteObject(job.sourceUrl).catch(() => {});
      await safeRm(zipPath).catch(() => {});
    } else {
      await safeRm(zipPath);
    }
  } catch (error) {
    // Los temporales de trabajo se limpian siempre; el ZIP fuente (S3: la
    // copia local descargada; disco: el original) se conserva para el
    // reintento — la limpieza NUNCA debe enmascarar el error original (un
    // EBUSY de Windows aquí ocultaba la causa real del fallo).
    await safeRm(workDir).catch(() => {});
    if (S3_MODE) await safeRm(zipPath).catch(() => {});
    if (error instanceof ValidationError) {
      await prisma.vehicleColor.update({ where: { id: color.id }, data: { activeJobId: null } }).catch(() => {});
      // Fallo permanente: lo que se haya alcanzado a subir bajo el prefijo
      // propio de este job queda huérfano (la transacción que lo hace
      // "vivo" nunca corrió) — limpieza best-effort.
      if (S3_MODE) {
        const prefix = `/uploads/models/${color.vehicle.slug}/${color.colorSlug}/${uploadJobId}`;
        await deleteObjectsByPrefix(prefix).catch(() => {});
      }
    }
    throw error;
  }
}

/** Limpieza best-effort del prefijo S3 propio de un job que terminó en
 * fallo permanente por agotar reintentos (worker/index.mjs) — no aplica en
 * modo disco (el scratch ya se limpia solo en cada re-intento). */
export async function cleanupAbandonedJob(prisma, uploadJobId) {
  if (!S3_MODE) return;
  try {
    const job = await prisma.uploadJob.findUnique({
      where: { id: uploadJobId },
      include: { vehicleColor: { include: { vehicle: true } } },
    });
    const color = job?.vehicleColor;
    if (!color) return;
    await deleteObjectsByPrefix(`/uploads/models/${color.vehicle.slug}/${color.colorSlug}/${uploadJobId}`);
  } catch {
    // best-effort — nunca debe interferir con el manejo de errores del job
  }
}

/** Sube `files` ({ localPath, key }) con concurrencia acotada — 108 archivos
 * chicos no ameritan multipart (eso es para el ZIP grande, no para esto). */
async function uploadInBatches(files, concurrency) {
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const i = next++;
      const { localPath, key } = files[i];
      await saveObject(key, await readFile(localPath));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
}

function publicUrlToPath(publicUrl) {
  if (!publicUrl.startsWith("/uploads/")) throw new Error(`sourceUrl inesperado: ${publicUrl}`);
  return path.join(UPLOADS_ROOT, publicUrl.slice("/uploads/".length));
}

function formatFrameList(numbers) {
  const list = [...numbers].sort((a, b) => a - b).map((n) => String(n).padStart(3, "0"));
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} y ${list[list.length - 1]}`;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// rm tolerante a los locks transitorios de Windows (antivirus, indexador,
// handles recién cerrados): fs.rm reintenta EBUSY/EPERM por sí mismo.
function safeRm(p) {
  return rm(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
