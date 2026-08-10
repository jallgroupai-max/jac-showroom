// Pipeline de un ZIP de color (plan §2.3): extraer en streaming, validar 36
// fotogramas, derivar LOW/MEDIUM/HIGH en WebP, swap atómico y limpieza.
// Cada paso es idempotente: si el worker muere a la mitad, re-ejecutar el job
// desde cero produce el mismo resultado.
import { mkdir, rm, rename, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import unzipper from "unzipper"; // CJS — sin named exports en ESM
import sharp from "sharp";

// Windows: sharp/libvips cachea descriptores de archivo — sin esto, los
// archivos de entrada quedan bloqueados (EBUSY) al intentar borrarlos.
sharp.cache(false);

// Mismo root que src/lib/storage.ts — fuera de public/ (Next no sirve
// archivos añadidos a public/ tras el build; van por el route handler).
const UPLOADS_ROOT = path.join(process.cwd(), "uploads-data");

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

  const zipPath = publicUrlToPath(job.sourceUrl);
  const workDir = path.join(UPLOADS_ROOT, "tmp", `job-${uploadJobId}`);
  const srcDir = path.join(workDir, "src");
  const outDir = path.join(workDir, "out");

  try {
    await setProgress("EXTRACTING", 2);

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

    // — Swap atómico (§2.3): el set nuevo se escribe completo fuera de la
    //   ruta final y solo al terminar se conmuta. El showroom nunca ve un
    //   set a medio escribir; si algo falla aquí, el set viejo sigue intacto.
    await setProgress("COMPRESSING", 94);
    const finalDir = path.join(UPLOADS_ROOT, "models", color.vehicle.slug, color.colorSlug);
    const retiredDir = `${finalDir}.old-${uploadJobId}`;
    await mkdir(path.dirname(finalDir), { recursive: true });
    if (await exists(finalDir)) await rename(finalDir, retiredDir);
    await rename(outDir, finalDir);
    await safeRm(retiredDir);

    // — Registrar el resultado. profileImageUrl derivada del frame 25 LOW
    //   (plan §1.3) — la muestra siempre coincide con el color real.
    const spriteBasePath = `/uploads/models/${color.vehicle.slug}/${color.colorSlug}`;
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

    // — Limpieza: ZIP original y temporales (§2.3 — un job terminado no deja
    //   huérfanos). El ZIP solo se borra en éxito: mientras haya error queda
    //   disponible para "Reintentar" sin volver a subir (§2.4).
    await safeRm(workDir);
    await safeRm(zipPath);
  } catch (error) {
    // Los temporales de trabajo se limpian siempre; el ZIP fuente se conserva
    // para el reintento. La limpieza NUNCA debe enmascarar el error original
    // (un EBUSY de Windows aquí ocultaba la causa real del fallo).
    await safeRm(workDir).catch(() => {});
    if (error instanceof ValidationError) {
      await prisma.vehicleColor.update({ where: { id: color.id }, data: { activeJobId: null } }).catch(() => {});
    }
    throw error;
  }
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
