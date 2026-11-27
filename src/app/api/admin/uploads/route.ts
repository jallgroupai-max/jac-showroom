import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { newTmpUploadKey, saveUploadStream } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { base64DecodeStream } from "@/lib/base64-stream";
import { savePart, PartError } from "@/lib/admin/vehicle-package/chunked-upload";

// Recepción de imágenes sueltas (fotogramas de un color) — emulación local del
// flujo presigned (plan §2.3): el body va en streaming directo a disco, nunca
// a memoria (§2.5). Con S3/R2 esta ruta se sustituye por una que solo firma
// la URL del bucket. La UI sube los fotogramas de a uno, en secuencia, o un
// .zip con los 36 (el worker lo descomprime).
//
// Modo por PARTES (`?uploadId=<uuid>&part=<n>`): para el paquete de vehículo,
// que supera el tope de 100MB por request de Cloudflare. Cada PUT trae una
// parte (≤ ~50MB, en base64 igual que el resto) que se guarda en disco en
// streaming; el POST /api/admin/vehicles/import las concatena. Ver
// lib/admin/vehicle-package/chunked-upload.ts.
const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "zip"];

export async function PUT(request: NextRequest) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 36 fotogramas por color: 600/hora alcanza para ~16 colores por hora por IP
  // y aun así corta un abuso de disco (plan A7).
  const { allowed } = rateLimit({
    key: `uploads:${clientIp(request.headers)}`,
    limit: 600,
    windowSeconds: 3600,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas subidas — espera unos minutos" }, { status: 429 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "Sin contenido" }, { status: 400 });
  }

  const encoding = request.nextUrl.searchParams.get("encoding");
  const partParam = request.nextUrl.searchParams.get("part");
  if (partParam !== null) {
    try {
      await savePart(
        request.nextUrl.searchParams.get("uploadId") ?? "",
        Number(partParam),
        encoding === "base64" ? request.body.pipeThrough(base64DecodeStream()) : request.body,
      );
    } catch (error) {
      if (error instanceof PartError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
    return NextResponse.json({ ok: true });
  }

  const fileName = request.nextUrl.searchParams.get("filename") ?? "";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: "Solo se aceptan imágenes .png, .jpg, .webp o un .zip" }, { status: 415 });
  }

  // La UI manda encoding=base64 para pasar el WAF (ver base64-stream.ts). Sin
  // el parámetro se acepta el binario tal cual (curl, pestañas viejas).
  const body = encoding === "base64" ? request.body.pipeThrough(base64DecodeStream()) : request.body;

  const key = newTmpUploadKey(ext);
  await saveUploadStream(key, body);
  return NextResponse.json({ key });
}
