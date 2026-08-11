import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { readUpload } from "@/lib/storage";

// Sirve los assets subidos desde el panel (sprites, panorámicas, escenarios).
// Viven FUERA de public/ porque Next no sirve archivos añadidos a public/
// después del build (en dev sí — el 404 solo aparecía en producción).
// Público sin auth: son los mismos assets que consume el showroom.
// Proxy dual-mode: lib/storage lee de disco local o del bucket S3 según
// haya o no variables S3_* — esta ruta no sabe (ni le importa) cuál.

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

  const asset = await readUpload(key);
  if (!asset) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Mismo criterio de caché que /assets en next.config.ts: reuso inmediato
  // en la sesión, refresco en segundo plano tras un reemplazo.
  const headers: HeadersInit = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
  };
  if (asset.contentLength !== null) headers["Content-Length"] = String(asset.contentLength);

  return new Response(asset.stream, { headers });
}
