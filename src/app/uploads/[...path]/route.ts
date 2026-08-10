import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { UPLOADS_ROOT } from "@/lib/storage";

// Sirve los assets subidos desde el panel (sprites, panorámicas, escenarios).
// Viven FUERA de public/ porque Next no sirve archivos añadidos a public/
// después del build (en dev sí — el 404 solo aparecía en producción).
// Público sin auth: son los mismos assets que consume el showroom.
// Con S3/R2 esta ruta desaparece — las URLs pasarán a apuntar al bucket/CDN.

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(_request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params;

  // Anti path-traversal — mismo criterio que normalizeKey en lib/storage.
  const key = path.posix.normalize(segments.join("/"));
  if (key.startsWith("..") || path.isAbsolute(key)) {
    return NextResponse.json({ error: "Ruta inválida" }, { status: 400 });
  }
  // El área temporal (ZIPs a medio procesar) nunca se sirve.
  if (key.startsWith("tmp/")) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  const contentType = CONTENT_TYPES[path.extname(key).toLowerCase()];
  if (!contentType) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const filePath = path.join(UPLOADS_ROOT, key);
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (!info.isFile()) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Mismo criterio de caché que /assets en next.config.ts: reuso inmediato
  // en la sesión, refresco en segundo plano tras un reemplazo.
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
