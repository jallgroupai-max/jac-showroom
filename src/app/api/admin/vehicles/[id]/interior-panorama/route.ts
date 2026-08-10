import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { saveUpload, deleteUpload } from "@/lib/storage";

// Panorámica de interior (plan §1.4 / artefacto Req 6): equirectangular 2:1
// EXACTO — validado con sharp.metadata() ANTES de guardar nada; si no cumple,
// 422 con mensaje accionable. La variante mobile (≤4096px, límite de textura
// de GPU móvil) la genera el servidor — nunca se le pide al usuario.
const MOBILE_MAX_WIDTH = 4096;
const DESKTOP_MAX_WIDTH = 8192;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireAdminUser();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: vehicleId } = await ctx.params;
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.status === "ARCHIVED") {
    return NextResponse.json({ error: "El vehículo no existe" }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Selecciona una imagen (JPG, PNG o WebP)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return NextResponse.json({ error: "El archivo no es una imagen válida" }, { status: 422 });
  }

  const { width, height } = meta;
  if (!width || !height || width !== height * 2) {
    return NextResponse.json(
      {
        error: `La imagen debe cargarse en formato 2:1 exacto (equirectangular) — esta mide ${width ?? "?"}×${height ?? "?"}.`,
      },
      { status: 422 },
    );
  }

  // Heurística anti-"imagen equivocada": una equirectangular real del
  // interior llena toda la esfera; un render de exterior sobre fondo liso
  // (que puede medir 2:1 por casualidad) deja gran parte de la imagen en un
  // color uniforme y en el visor se ve "negro / vacío". Se ADVIERTE, nunca
  // se bloquea — hay panorámicas nocturnas legítimas con zonas oscuras.
  const warning = await detectUniformBackground(buffer);

  // Derivar y guardar: original (capada a 8192) + mobile (≤4096).
  const base = `interior/${vehicle.slug}`;
  const desktop = await sharp(buffer)
    .resize({ width: Math.min(width, DESKTOP_MAX_WIDTH) })
    .webp({ quality: 80 })
    .toBuffer();
  const mobile = await sharp(buffer)
    .resize({ width: Math.min(width, MOBILE_MAX_WIDTH) })
    .webp({ quality: 78 })
    .toBuffer();

  // Nombres versionados por timestamp: reemplazar una panorámica no debe
  // servir la vieja desde caché del navegador.
  const version = Date.now();
  const [oldDesktop, oldMobile] = [vehicle.interiorPanoramaUrl, vehicle.interiorPanoramaMobileUrl];
  const desktopUrl = await saveUpload(`${base}/panorama-${version}.webp`, desktop);
  const mobileUrl = await saveUpload(`${base}/panorama-mobile-${version}.webp`, mobile);

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        interiorPanoramaUrl: desktopUrl,
        interiorPanoramaMobileUrl: mobileUrl,
        interiorPanoramaWidth: Math.min(width, DESKTOP_MAX_WIDTH),
        interiorPanoramaHeight: Math.min(width, DESKTOP_MAX_WIDTH) / 2,
      },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "upload-interior-panorama",
      entityType: "Vehicle",
      entityId: vehicleId,
      detail: { width, height, bytes: file.size },
    });
  });

  if (oldDesktop) await deleteUpload(oldDesktop);
  if (oldMobile) await deleteUpload(oldMobile);

  return NextResponse.json({ desktopUrl, mobileUrl, warning });
}

/** Devuelve un mensaje de advertencia si una fracción grande de la imagen es
 * casi negra o casi blanca (fondo de estudio) — señal típica de que se subió
 * un render/foto normal en vez de una panorámica equirectangular. */
async function detectUniformBackground(buffer: Buffer): Promise<string | null> {
  const SAMPLE_WIDTH = 128;
  const THRESHOLD = 0.45; // 45% de la imagen en un extremo → sospechosa
  try {
    const { data } = await sharp(buffer)
      .resize({ width: SAMPLE_WIDTH })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let dark = 0;
    let bright = 0;
    for (const v of data) {
      if (v <= 12) dark++;
      else if (v >= 243) bright++;
    }
    const fraction = Math.max(dark, bright) / data.length;
    if (fraction >= THRESHOLD) {
      return `Aviso: cerca del ${Math.round(fraction * 100)}% de la imagen es un fondo uniforme (${dark >= bright ? "negro" : "blanco"}). Verifica que sea una panorámica equirectangular 360° real del interior — una foto o render normal se verá vacía/deformada en el visor.`;
    }
    return null;
  } catch {
    return null; // la heurística nunca debe tumbar la subida
  }
}
