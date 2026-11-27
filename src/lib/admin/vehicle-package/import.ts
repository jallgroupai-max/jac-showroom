import path from "node:path";
import { Readable } from "node:stream";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import unzipper from "unzipper";
import type { AdminUser } from "@prisma/client";
import type { VehicleImportResult } from "@/lib/admin/api-types";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { slugify } from "@/lib/admin/slug";
import { deriveInteriorPanorama } from "@/lib/admin/interior-panorama";
import { saveUpload, saveUploadStream, deleteUpload, newTmpUploadKey } from "@/lib/storage";
import { getBoss, QUEUE_COLOR_ZIP } from "@/lib/queue";
import { mapPool } from "./pool";
import {
  IMPORT_LIMITS,
  MANIFEST_NAME,
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  indexZipEntries,
  manifestSchema,
  referencedPaths,
  type Manifest,
} from "./format";

// Importación de un paquete "jac-vehicle" (formato en ./format.ts): crea un
// vehículo NUEVO en DRAFT. Orden deliberado:
//   1. validar TODO sin escribir nada (zip, manifiesto, archivos referenciados,
//      catálogos: categoría / íconos / escenarios);
//   2. escribir archivos a storage (rastreados para limpiarlos si algo falla);
//   3. UNA transacción de DB (vehículo + hijos + UploadJob de cada color +
//      AuditLog) — o todo o nada;
//   4. encolar los jobs COLOR_ZIP del worker existente (él genera low/medium/high).

export class ImportError extends Error {}

type ZipItem = { path: string; type: string; size: number; file: unzipper.File };

const pad3 = (n: number) => String(n).padStart(3, "0");

/** Lee una entrada completa a memoria con tope — para el manifiesto y las imágenes sueltas. */
async function readEntry(item: ZipItem, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of item.file.stream() as unknown as AsyncIterable<Buffer>) {
    total += chunk.length;
    // Se cuenta lo REAL descomprimido, no lo declarado por el zip (zip bomb).
    if (total > maxBytes) throw new ImportError(`"${item.path}" excede el tamaño permitido.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function* limited(source: AsyncIterable<Buffer>, maxBytes: number, name: string) {
  let total = 0;
  for await (const chunk of source) {
    total += chunk.length;
    if (total > maxBytes) throw new ImportError(`"${name}" excede el tamaño permitido.`);
    yield chunk;
  }
}

const FORMAT_EXT: Record<string, string> = { webp: ".webp", jpeg: ".jpg", png: ".png" };

async function imageMeta(buffer: Buffer, name: string) {
  try {
    const meta = await sharp(buffer).metadata();
    const ext = meta.format ? FORMAT_EXT[meta.format] : undefined;
    if (!ext || !meta.width || !meta.height) throw new Error("formato");
    return { ext, width: meta.width, height: meta.height };
  } catch {
    throw new ImportError(`"${name}" no es una imagen válida (se esperaba WebP, PNG o JPG).`);
  }
}

function describeIssue(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  const where = issue.path.length ? ` (${issue.path.map(String).join(".")})` : "";
  return `${MANIFEST_NAME} no es válido${where}: ${issue.message}`;
}

async function pickSlug(base: string): Promise<string> {
  const root = slugify(base) || "vehiculo";
  for (let n = 1; n <= 99; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    if (!(await prisma.vehicle.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  throw new ImportError(`No se encontró un slug libre a partir de "${root}".`);
}

/** `zipPath` = zip ya ensamblado en disco local (ver chunked-upload.ts). */
export async function importVehiclePackage(user: AdminUser, zipPath: string): Promise<VehicleImportResult> {
  const written: string[] = []; // URLs públicas escritas — se borran si algo falla antes del commit
  let committed = false;
  try {
    return await run(user, zipPath, written, () => {
      committed = true;
    });
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, error: error.message };
    console.error("[import-vehicle]", error);
    return { ok: false, error: `Error inesperado al importar: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    if (!committed) await Promise.all(written.map((url) => deleteUpload(url).catch(() => {})));
  }
}

async function run(user: AdminUser, zipPath: string, written: string[], markCommitted: () => void): Promise<VehicleImportResult> {
  // — 1) Zip + manifiesto -------------------------------------------------
  let directory: unzipper.CentralDirectory;
  try {
    directory = await unzipper.Open.file(zipPath);
  } catch {
    throw new ImportError("El archivo no es un ZIP válido o está corrupto.");
  }
  let index: Map<string, ZipItem>;
  try {
    index = indexZipEntries(
      directory.files.map((file): ZipItem => ({ path: file.path, type: file.type, size: file.uncompressedSize, file })),
    );
  } catch (error) {
    throw new ImportError(error instanceof Error ? error.message : "ZIP no válido.");
  }

  const manifestItem = index.get(MANIFEST_NAME);
  if (!manifestItem) throw new ImportError(`El ZIP no trae ${MANIFEST_NAME} — no es un paquete de vehículo exportado desde el panel.`);
  if (manifestItem.size > IMPORT_LIMITS.maxManifestBytes) throw new ImportError(`${MANIFEST_NAME} es demasiado grande.`);

  let raw: unknown;
  try {
    raw = JSON.parse((await readEntry(manifestItem, IMPORT_LIMITS.maxManifestBytes)).toString("utf8"));
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(`${MANIFEST_NAME} no es JSON válido.`);
  }
  const head = (raw ?? {}) as { format?: unknown; version?: unknown };
  if (head.format !== PACKAGE_FORMAT) throw new ImportError(`El ZIP no es un paquete "${PACKAGE_FORMAT}".`);
  if (head.version !== PACKAGE_VERSION) {
    throw new ImportError(`Versión de paquete ${String(head.version)} no soportada (esta app entiende la ${PACKAGE_VERSION}).`);
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) throw new ImportError(describeIssue(parsed.error));
  const m: Manifest = parsed.data;

  // — 2) Archivos referenciados presentes y de tamaño razonable --------------
  const frameSet = new Set(m.colors.flatMap((c) => c.frames ?? []));
  const referenced = referencedPaths(m);
  const missingFiles = referenced.filter((p) => !index.has(p));
  if (missingFiles.length) {
    throw new ImportError(
      `El ZIP no trae ${missingFiles.length === 1 ? "el archivo" : "los archivos"} que declara ${MANIFEST_NAME}: ${missingFiles.slice(0, 5).join(", ")}${missingFiles.length > 5 ? "…" : ""}.`,
    );
  }
  for (const p of referenced) {
    const limit = frameSet.has(p)
      ? IMPORT_LIMITS.maxFrameBytes
      : p === m.interiorPanorama
        ? IMPORT_LIMITS.maxPanoramaBytes
        : IMPORT_LIMITS.maxImageBytes;
    if ((index.get(p) as ZipItem).size > limit) throw new ImportError(`"${p}" excede el tamaño permitido.`);
  }

  // — 3) Catálogos del destino: todo lo que falte se reporta junto ------------
  const iconKeys = [...new Set([...m.vehicle.featureIcons, ...m.pointsOfInterest.map((p) => p.icon)])];
  const [category, icons, scenarios] = await Promise.all([
    prisma.category.findUnique({ where: { slug: m.vehicle.category } }),
    prisma.hotspotIcon.findMany({ where: { key: { in: iconKeys } }, select: { id: true, key: true } }),
    prisma.scenario.findMany({
      where: { label: { in: m.scenarios.map((s) => s.label) } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, label: true },
    }),
  ]);
  const iconId = new Map(icons.map((i) => [i.key, i.id]));
  const missing: string[] = [];
  if (!category) missing.push(`falta la categoría "${m.vehicle.category}" en este entorno`);
  for (const key of iconKeys) if (!iconId.has(key)) missing.push(`falta el icono "${key}" en este entorno`);
  if (missing.length) throw new ImportError(`No se puede importar: ${missing.join("; ")}. Créalo(s) en el panel y vuelve a intentar.`);

  // Etiquetas repetidas en el catálogo: gana la primera por orden.
  const scenarioId = new Map<string, string>();
  for (const s of scenarios) if (!scenarioId.has(s.label)) scenarioId.set(s.label, s.id);
  const skippedScenarios = m.scenarios.filter((s) => !scenarioId.has(s.label)).map((s) => s.label);

  const slug = await pickSlug(m.vehicle.slug);

  // — 4) Escritura de archivos (rastreados en `written`) ----------------------
  const read = (p: string, max: number) => readEntry(index.get(p) as ZipItem, max);
  const storeImage = async (p: string | null, dir: string): Promise<string | null> => {
    if (!p) return null;
    const buffer = await read(p, IMPORT_LIMITS.maxImageBytes);
    const { ext } = await imageMeta(buffer, p);
    const url = await saveUpload(`${dir}/${crypto.randomUUID()}${ext}`, buffer);
    written.push(url);
    return url;
  };

  const cardImageUrl = await storeImage(m.images.card, `card/${slug}`);
  const ownBackgroundUrl = await storeImage(m.images.ownBackground, `backgrounds/${slug}`);
  const poiImages: { image: string | null; imageMobile: string | null }[] = [];
  for (const p of m.pointsOfInterest) {
    poiImages.push({
      image: await storeImage(p.image, `poi/${slug}`),
      imageMobile: await storeImage(p.imageMobile, `poi/${slug}`),
    });
  }

  let panorama: { desktopUrl: string; mobileUrl: string; width: number; height: number } | null = null;
  if (m.interiorPanorama) {
    // La panorámica se procesa aquí, en el request (igual que /interior-panorama):
    // no existe un job INTERIOR_PANORAMA en el worker.
    const buffer = await read(m.interiorPanorama, IMPORT_LIMITS.maxPanoramaBytes);
    const { width, height } = await imageMeta(buffer, m.interiorPanorama);
    if (width !== height * 2) {
      throw new ImportError(`La panorámica interior debe ser 2:1 exacto — "${m.interiorPanorama}" mide ${width}×${height}.`);
    }
    const derived = await deriveInteriorPanorama(buffer, width);
    const version = Date.now();
    const desktopUrl = await saveUpload(`interior/${slug}/panorama-${version}.webp`, derived.desktop);
    written.push(desktopUrl);
    const mobileUrl = await saveUpload(`interior/${slug}/panorama-mobile-${version}.webp`, derived.mobile);
    written.push(mobileUrl);
    panorama = { desktopUrl, mobileUrl, width: derived.desktopWidth, height: derived.desktopHeight };
  }

  // Fotogramas de cada color → archivos temporales; el job COLOR_ZIP del
  // worker (process-color-zip.mjs) los valida (36, misma resolución) y deriva
  // low/medium/high. Mismo contrato que la tanda suelta del wizard: nombre con
  // el número de fotograma (001..036) + URL tmp. Se nombran por POSICIÓN, no
  // por el nombre de archivo del paquete.
  const frameSources = new Map<string, { name: string; url: string }[]>();
  for (const color of m.colors) {
    if (!color.frames) continue;
    const sources = await mapPool(color.frames, 4, async (framePath, i) => {
      const item = index.get(framePath) as ZipItem;
      const ext = path.extname(framePath).toLowerCase();
      const source = limited(item.file.stream() as unknown as AsyncIterable<Buffer>, IMPORT_LIMITS.maxFrameBytes, framePath);
      const url = await saveUploadStream(newTmpUploadKey(ext), Readable.toWeb(Readable.from(source)) as ReadableStream<Uint8Array>);
      written.push(url);
      return { name: `${pad3(i + 1)}${ext}`, url };
    });
    frameSources.set(color.slug, sources);
  }

  // — 5) UNA transacción ------------------------------------------------------
  const last = await prisma.vehicle.aggregate({ _max: { order: true } });
  const { vehicle, jobs } = await prisma.$transaction(
    async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          slug,
          status: "DRAFT",
          commercialName: m.vehicle.commercialName,
          technicalName: m.vehicle.technicalName,
          trimLabel: m.vehicle.trimLabel,
          typeTag: m.vehicle.typeTag,
          warrantyLabel: m.vehicle.warrantyLabel,
          categoryId: (category as { id: string }).id,
          order: (last._max.order ?? -1) + 1,
          cardImageUrl,
          ownBackgroundUrl,
          interiorPanoramaUrl: panorama?.desktopUrl ?? null,
          interiorPanoramaMobileUrl: panorama?.mobileUrl ?? null,
          interiorPanoramaWidth: panorama?.width ?? null,
          interiorPanoramaHeight: panorama?.height ?? null,
          featureIcons: {
            create: m.vehicle.featureIcons.map((key, order) => ({ hotspotIconId: iconId.get(key) as string, order })),
          },
          specGroups: {
            create: m.specGroups.map((g, order) => ({
              title: g.title,
              order,
              items: { create: g.items.map((item, i) => ({ label: item.label, value: item.value, order: i })) },
            })),
          },
          viewerPositions: { create: m.viewerPositions },
          scenarios: {
            create: m.scenarios
              .filter((s) => scenarioId.has(s.label))
              .map((s) => ({ scenarioId: scenarioId.get(s.label) as string, enabled: s.enabled })),
          },
          pointsOfInterest: {
            create: m.pointsOfInterest.map((p, i) => ({
              mode: p.mode,
              iconId: iconId.get(p.icon) as string,
              title: p.title,
              description: p.description,
              order: p.order,
              iconSize: p.iconSize,
              blink: p.blink,
              frame: p.frame,
              textureX: p.textureX,
              textureY: p.textureY,
              imageUrl: poiImages[i].image,
              imageMobileUrl: poiImages[i].imageMobile,
            })),
          },
        },
      });

      const jobs: { id: string; color: string }[] = [];
      for (const c of m.colors) {
        const color = await tx.vehicleColor.create({
          data: { vehicleId: created.id, colorSlug: c.slug, colorName: c.name, colorHex: c.hex, order: c.order },
        });
        const sources = frameSources.get(c.slug);
        if (!sources) continue; // color sin galería procesada en el origen
        const job = await tx.uploadJob.create({
          data: {
            type: "COLOR_ZIP",
            sourceUrl: JSON.stringify(sources),
            vehicleColorId: color.id,
            vehicleId: created.id,
            createdById: user.id,
          },
        });
        await tx.vehicleColor.update({ where: { id: color.id }, data: { activeJobId: job.id } });
        jobs.push({ id: job.id, color: c.name });
      }

      await writeAudit(tx, {
        userId: user.id,
        action: "import-vehicle",
        entityType: "Vehicle",
        entityId: created.id,
        detail: {
          slug,
          requestedSlug: m.vehicle.slug,
          colors: m.colors.length,
          jobs: jobs.length,
          skippedScenarios,
        },
      });
      return { vehicle: created, jobs };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  markCommitted();

  // — 6) Encolar (fuera de la transacción: efecto externo) ------------------
  // Los fotogramas temporales ya son de los jobs; si el encolado falla el job
  // pasa a ERROR transitorio y el botón "Reintentar" del paso 3 lo recupera.
  const warnings: string[] = (m.warnings ?? []).map((w) => `Aviso del paquete: ${w}`);
  let queued = 0;
  try {
    const boss = await getBoss();
    for (const job of jobs) {
      try {
        await boss.send(QUEUE_COLOR_ZIP, { uploadJobId: job.id });
        queued++;
      } catch (error) {
        await markEnqueueFailure(job.id, error);
        warnings.push(`No se pudo encolar el color "${job.color}" — usa "Reintentar" en el paso Galería 360°.`);
      }
    }
  } catch (error) {
    await Promise.all(jobs.map((job) => markEnqueueFailure(job.id, error)));
    warnings.push('No se pudo contactar con la cola de procesamiento — usa "Reintentar" en el paso Galería 360° de cada color.');
  }

  revalidatePath("/admin/vehiculos");
  return {
    ok: true,
    id: vehicle.id,
    slug,
    requestedSlug: slug === m.vehicle.slug ? null : m.vehicle.slug,
    colorsQueued: queued,
    skippedScenarios,
    warnings,
  };
}

function markEnqueueFailure(jobId: string, error: unknown) {
  return prisma.uploadJob
    .update({
      where: { id: jobId },
      data: {
        status: "ERROR",
        errorKind: "TRANSIENT",
        errorMessage: `No se pudo encolar el procesamiento: ${error instanceof Error ? error.message : String(error)}`,
        finishedAt: new Date(),
      },
    })
    .catch(() => {});
}
