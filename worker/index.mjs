// Worker de assets 360° (plan §2.3) — proceso Node APARTE de Next: la
// compresión satura CPU y no puede vivir en un request. Arranque:
//   npm run worker    (requiere Postgres arriba y .env)
//
// Cola: pg-boss sobre el MISMO Postgres (sin infraestructura extra).
// Concurrencia 1 deliberada (§2.3): subir cinco colores a la vez es normal —
// se resuelven en orden y la UI muestra la posición en cola.
import { PgBoss } from "pg-boss";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { processColorZip, cleanupAbandonedJob } from "./process-color-zip.mjs";
import { deleteObjectsByPrefix } from "../src/lib/storage-engine.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL no está definido — arranca con: npm run worker");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const boss = new PgBoss({ connectionString });

export const QUEUE_COLOR_ZIP = "color-zip";

// Reintentos AUTOMÁTICOS solo para fallos transitorios (§2.4) — los gestiona
// el propio worker (attempts en UploadJob), no pg-boss, para que el contador
// que ve el usuario y el real sean el mismo.
const MAX_AUTO_ATTEMPTS = 3;
const backoffSeconds = (attempt) => 10 * 2 ** (attempt - 1); // 10s, 20s, 40s

boss.on("error", (error) => console.error("[pg-boss]", error.message));

await boss.start();
await boss.createQueue(QUEUE_COLOR_ZIP);

await boss.work(QUEUE_COLOR_ZIP, { batchSize: 1 }, async ([job]) => {
  const { uploadJobId } = job.data;
  console.log(`→ job ${uploadJobId}`);

  try {
    await processColorZip(prisma, uploadJobId);
    console.log(`✔ job ${uploadJobId} listo`);
  } catch (error) {
    if (error?.name === "ValidationError") {
      // Reintentar es inútil: el mismo archivo fallará idéntico. Se detiene
      // y la UI ofrece "Reemplazar archivo" (§2.4).
      await prisma.uploadJob.update({
        where: { id: uploadJobId },
        data: {
          status: "ERROR",
          errorKind: "VALIDATION",
          errorMessage: error.message,
          finishedAt: new Date(),
        },
      });
      console.warn(`✘ job ${uploadJobId} validación: ${error.message}`);
      return; // el job de pg-boss se completa — no hay auto-reintento
    }

    // Transitorio: backoff y reintento automático hasta MAX_AUTO_ATTEMPTS;
    // después queda en ERROR con "Reintentar" manual siempre disponible.
    const updated = await prisma.uploadJob.update({
      where: { id: uploadJobId },
      data: { attempts: { increment: 1 } },
    });
    if (updated.attempts < MAX_AUTO_ATTEMPTS) {
      const delay = backoffSeconds(updated.attempts);
      await prisma.uploadJob.update({
        where: { id: uploadJobId },
        data: {
          status: "QUEUED",
          progress: 0,
          errorMessage: `No se pudo procesar (intento ${updated.attempts} de ${MAX_AUTO_ATTEMPTS}) — reintentando en ${delay}s…`,
        },
      });
      await boss.send(QUEUE_COLOR_ZIP, { uploadJobId }, { startAfter: delay });
      console.warn(`↻ job ${uploadJobId} reintento en ${delay}s: ${error.message}`);
    } else {
      await prisma.uploadJob.update({
        where: { id: uploadJobId },
        data: {
          status: "ERROR",
          errorKind: "TRANSIENT",
          errorMessage: `No se pudo procesar tras ${MAX_AUTO_ATTEMPTS} intentos: ${error.message}`,
          finishedAt: new Date(),
        },
      });
      // Fallo permanente: lo que se haya alcanzado a subir al bucket bajo el
      // prefijo propio de este job queda huérfano — limpieza best-effort.
      await cleanupAbandonedJob(prisma, uploadJobId);
      console.error(`✘ job ${uploadJobId} agotó reintentos: ${error.message}`);
    }
  }
});

console.log(`Worker de assets arriba — cola "${QUEUE_COLOR_ZIP}", concurrencia 1.`);

// ————————————————————————————————————————————————————————————————
// Purga diferida (plan §1.8): un vehículo ARCHIVED conserva registro y
// assets durante el periodo de gracia; pasado ese plazo, este job diario
// borra la fila (cascade limpia colores/POIs/specs) y sus archivos.
// ————————————————————————————————————————————————————————————————
const QUEUE_PURGE = "purge-archived";
const GRACE_DAYS = Number(process.env.ARCHIVE_GRACE_DAYS ?? 30);

await boss.createQueue(QUEUE_PURGE);
await boss.schedule(QUEUE_PURGE, "0 4 * * *", {}, { tz: "America/Caracas" });

await boss.work(QUEUE_PURGE, { batchSize: 1 }, async () => {
  const cutoff = new Date(Date.now() - GRACE_DAYS * 86_400_000);
  const expired = await prisma.vehicle.findMany({
    where: { status: "ARCHIVED", archivedAt: { lt: cutoff } },
    select: { id: true, slug: true },
  });
  for (const vehicle of expired) {
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    for (const dir of [`models/${vehicle.slug}`, `interior/${vehicle.slug}`, `backgrounds/${vehicle.slug}`, `poi/${vehicle.slug}`]) {
      await deleteObjectsByPrefix(`/uploads/${dir}`).catch(() => {});
    }
    console.log(`🗑 purgado ${vehicle.slug} (archivado hace más de ${GRACE_DAYS} días)`);
  }
  if (expired.length === 0) console.log("purga diaria: nada que limpiar");
});

// Al reiniciar el worker, re-encolar jobs que quedaron a medias (el proceso
// pudo morir en pleno EXTRACTING/COMPRESSING — los pasos son idempotentes).
const stuck = await prisma.uploadJob.findMany({
  where: { status: { in: ["EXTRACTING", "COMPRESSING"] } },
  select: { id: true },
});
for (const job of stuck) {
  await prisma.uploadJob.update({
    where: { id: job.id },
    data: { status: "QUEUED", progress: 0 },
  });
  await boss.send(QUEUE_COLOR_ZIP, { uploadJobId: job.id });
  console.log(`↻ job ${job.id} re-encolado tras reinicio`);
}
