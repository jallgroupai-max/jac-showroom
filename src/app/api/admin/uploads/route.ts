import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { newTmpUploadKey, saveUploadStream } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Recepción de imágenes sueltas (fotogramas de un color) — emulación local del
// flujo presigned (plan §2.3): el body va en streaming directo a disco, nunca
// a memoria (§2.5). Con S3/R2 esta ruta se sustituye por una que solo firma
// la URL del bucket. La UI sube los fotogramas de a uno, en secuencia.
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

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

  const fileName = request.nextUrl.searchParams.get("filename") ?? "";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: "Solo se aceptan imágenes .png, .jpg o .webp" }, { status: 415 });
  }

  const key = newTmpUploadKey(ext);
  await saveUploadStream(key, request.body);
  return NextResponse.json({ key });
}
