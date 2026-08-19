import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { newTmpUploadKey, saveUploadStream } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Una sola subida de ZIP a la vez en todo el servidor. Dos transferencias de
// 100MB+ en paralelo no terminan antes: se reparten el mismo ancho de banda
// y el usuario ve dos barras arrastrándose en vez de una avanzando. La UI ya
// bloquea la zona de arrastre mientras sube, pero eso se salta con una
// segunda pestaña o un segundo administrador — el candado real vive acá.
//
// En memoria del proceso a propósito: tanto el contenedor de Railway como el
// del VPS corren UNA instancia de Next, así que alcanza. Mismo patrón de
// singleton por globalThis que src/lib/queue.ts y src/lib/prisma.ts.
const globalForUpload = globalThis as unknown as { zipUploadStartedAt?: number };

// Red de seguridad por si un stream quedara colgado sin resolver ni fallar:
// sin esto el panel quedaría inservible hasta el próximo reinicio. El umbral
// está muy por encima de cualquier subida real — nginx corta el cuerpo a los
// 600s y el edge de Railway a los 5 minutos.
const STALE_LOCK_MS = 30 * 60_000;

// Recepción de archivos grandes (ZIP de color) — emulación local del flujo
// presigned (plan §2.3): el body va en streaming directo a disco, nunca a
// memoria (§2.5: es lo que permite no imponer límite de tamaño). Con S3/R2
// esta ruta se sustituye por una que solo firma la URL del bucket.
export async function PUT(request: NextRequest) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 30 subidas por hora por IP — muy por encima de cualquier carga real de
  // catálogo, pero corta un abuso de disco (plan A7).
  const { allowed } = rateLimit({
    key: `uploads:${clientIp(request.headers)}`,
    limit: 30,
    windowSeconds: 3600,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas subidas — espera unos minutos" }, { status: 429 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "Sin contenido" }, { status: 400 });
  }

  const fileName = request.nextUrl.searchParams.get("filename") ?? "archivo.zip";
  const extension = fileName.toLowerCase().endsWith(".zip") ? "zip" : null;
  if (!extension) {
    return NextResponse.json({ error: "Solo se aceptan archivos .zip" }, { status: 415 });
  }

  const startedAt = globalForUpload.zipUploadStartedAt;
  if (startedAt !== undefined && Date.now() - startedAt < STALE_LOCK_MS) {
    return NextResponse.json(
      { error: "Ya hay un .zip subiendo — espera a que termine para subir el siguiente" },
      { status: 409 },
    );
  }
  globalForUpload.zipUploadStartedAt = Date.now();

  const body = request.body;
  try {
    const key = newTmpUploadKey(extension);
    await saveUploadStream(key, body);
    return NextResponse.json({ key });
  } finally {
    // SIEMPRE, también si el cliente aborta a mitad: saveUploadStream rechaza
    // y sin este finally el candado quedaría tomado tras cada subida fallida.
    globalForUpload.zipUploadStartedAt = undefined;
  }
}
