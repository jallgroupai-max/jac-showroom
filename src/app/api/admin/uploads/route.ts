import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { newTmpUploadKey, saveUploadStream } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";

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

  const key = newTmpUploadKey(extension);
  await saveUploadStream(key, request.body);
  return NextResponse.json({ key });
}
