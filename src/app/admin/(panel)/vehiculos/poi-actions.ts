"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { saveUpload, deleteUpload } from "@/lib/storage";

// Acciones de puntos de interés (Fase A3). Una sola tabla para destacado y
// punto (plan §1.5): el paso 4 edita el CONTENIDO de los de exterior
// (ícono, título, descripción, imagen, frame) y el paso 5 POSICIONA los de
// interior sobre la panorámica (textureX/Y normalizados 0–1 + blink).

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const iconSizeSchema = z.coerce.number().int().min(50).max(200).default(100);

const exteriorSchema = z.object({
  id: z.string().optional(),
  iconId: z.string().min(1, "Elige un ícono"),
  title: z.string().trim().min(1, "El título es obligatorio").max(80),
  description: z.string().trim().max(400),
  frame: z.coerce.number().int().min(1).max(36),
  iconSize: iconSizeSchema,
});

const interiorSchema = z.object({
  id: z.string().optional(),
  iconId: z.string().min(1),
  title: z.string().trim().min(1, "El título es obligatorio").max(80),
  description: z.string().trim().max(400),
  textureX: z.coerce.number().min(0).max(1),
  textureY: z.coerce.number().min(0).max(1),
  blink: z.enum(["SOFT", "FAST", "NONE"]),
  iconSize: iconSizeSchema,
});

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Comprime y sube un recorte de imagen de POI (mismo criterio que
// escenarios; artefacto Req 5). Compartido por el destacado de exterior
// (dos recortes: desktop 9:16 y mobile 16:9, ya recortados en el cliente
// con react-easy-crop) y por la imagen única de un punto interior.
async function processPoiImage(
  entry: FormDataEntryValue | null,
  existingUrl: string | null,
  slug: string,
  suffix: string,
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  if (!(entry instanceof File) || entry.size === 0) return { ok: true, url: existingUrl };
  if (!IMAGE_TYPES.has(entry.type)) {
    return { ok: false, error: "Formato de imagen no soportado — usa JPG, PNG o WebP." };
  }
  let compressed: Buffer;
  try {
    compressed = await sharp(Buffer.from(await entry.arrayBuffer()))
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch {
    return { ok: false, error: "El archivo no es una imagen válida." };
  }
  const newUrl = await saveUpload(`poi/${slug}/${crypto.randomUUID()}-${suffix}.webp`, compressed);
  if (existingUrl) await deleteUpload(existingUrl);
  return { ok: true, url: newUrl };
}

// ————————————————————————————————————————————————————————————————
// Paso 4 — Destacados (exterior). FormData porque puede traer imagen.
// ————————————————————————————————————————————————————————————————

export async function saveExteriorPoi(vehicleId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireAdminUser();
  const parsed = exteriorSchema.safeParse({
    id: formData.get("id") || undefined,
    iconId: formData.get("iconId"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    frame: formData.get("frame"),
    iconSize: formData.get("iconSize") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.status === "ARCHIVED") return { ok: false, error: "El vehículo no existe." };

  const existing = data.id
    ? await prisma.pointOfInterest.findUnique({ where: { id: data.id } })
    : null;
  if (data.id && (!existing || existing.vehicleId !== vehicleId)) {
    return { ok: false, error: "El destacado no existe." };
  }

  // Dos recortes de la misma foto fuente — 9:16 desktop y 16:9 mobile, ya
  // recortados en el cliente (react-easy-crop); no son la misma imagen a
  // dos resoluciones, son recortes DISTINTOS.
  const desktop = await processPoiImage(
    formData.get("imageDesktop"),
    existing?.imageUrl ?? null,
    vehicle.slug,
    "desktop",
  );
  if (!desktop.ok) return { ok: false, error: desktop.error };
  const mobile = await processPoiImage(
    formData.get("imageMobile"),
    existing?.imageMobileUrl ?? null,
    vehicle.slug,
    "mobile",
  );
  if (!mobile.ok) return { ok: false, error: mobile.error };
  const imageUrl = desktop.url;
  const imageMobileUrl = mobile.url;

  const poi = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.pointOfInterest.update({
          where: { id: existing.id },
          data: {
            iconId: data.iconId,
            title: data.title,
            description: data.description,
            frame: data.frame,
            iconSize: data.iconSize,
            imageUrl,
            imageMobileUrl,
          },
        })
      : await tx.pointOfInterest.create({
          data: {
            vehicleId,
            mode: "EXTERIOR",
            iconId: data.iconId,
            title: data.title,
            description: data.description,
            frame: data.frame,
            iconSize: data.iconSize,
            imageUrl,
            imageMobileUrl,
            order: await tx.pointOfInterest.count({ where: { vehicleId, mode: "EXTERIOR" } }),
          },
        });
    await writeAudit(tx, {
      userId: user.id,
      action: existing ? "update-poi" : "create-poi",
      entityType: "PointOfInterest",
      entityId: saved.id,
      detail: { vehicle: vehicle.slug, mode: "EXTERIOR", title: data.title },
    });
    return saved;
  });

  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  return { ok: true, id: poi.id };
}

// ————————————————————————————————————————————————————————————————
// Paso 5 — Puntos de interior (posición normalizada 0–1, plan §1.5).
// ————————————————————————————————————————————————————————————————

export async function saveInteriorPoi(vehicleId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireAdminUser();
  const parsed = interiorSchema.safeParse({
    id: formData.get("id") || undefined,
    iconId: formData.get("iconId"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    textureX: formData.get("textureX"),
    textureY: formData.get("textureY"),
    blink: formData.get("blink"),
    iconSize: formData.get("iconSize") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.status === "ARCHIVED") return { ok: false, error: "El vehículo no existe." };
  if (!vehicle.interiorPanoramaUrl) {
    return { ok: false, error: "Primero carga la panorámica del interior." };
  }

  const existing = data.id
    ? await prisma.pointOfInterest.findUnique({ where: { id: data.id } })
    : null;
  if (data.id && (!existing || existing.vehicleId !== vehicleId)) {
    return { ok: false, error: "El punto no existe." };
  }

  // Imagen opcional del punto interior — mismo criterio de compresión que el
  // destacado de exterior (artefacto Req 5).
  const image = await processPoiImage(formData.get("image"), existing?.imageUrl ?? null, vehicle.slug, "interior");
  if (!image.ok) return { ok: false, error: image.error };
  const imageUrl = image.url;

  const poi = await prisma.$transaction(async (tx) => {
    const payload = {
      iconId: data.iconId,
      title: data.title,
      description: data.description,
      textureX: data.textureX,
      textureY: data.textureY,
      blink: data.blink,
      iconSize: data.iconSize,
      imageUrl,
    };
    const saved = existing
      ? await tx.pointOfInterest.update({ where: { id: existing.id }, data: payload })
      : await tx.pointOfInterest.create({
          data: {
            ...payload,
            vehicleId,
            mode: "INTERIOR",
            order: await tx.pointOfInterest.count({ where: { vehicleId, mode: "INTERIOR" } }),
          },
        });
    await writeAudit(tx, {
      userId: user.id,
      action: existing ? "update-poi" : "create-poi",
      entityType: "PointOfInterest",
      entityId: saved.id,
      detail: { vehicle: vehicle.slug, mode: "INTERIOR", title: data.title },
    });
    return saved;
  });

  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  return { ok: true, id: poi.id };
}

// ————————————————————————————————————————————————————————————————
// Eliminar (ambos modos) — borra también la imagen del destacado.
// ————————————————————————————————————————————————————————————————

export async function deletePoi(vehicleId: string, poiId: string): Promise<ActionResult> {
  const user = await requireAdminUser();
  const poi = await prisma.pointOfInterest.findUnique({ where: { id: poiId } });
  if (!poi || poi.vehicleId !== vehicleId) return { ok: false, error: "El punto no existe." };

  await prisma.$transaction(async (tx) => {
    await tx.pointOfInterest.delete({ where: { id: poiId } });
    await writeAudit(tx, {
      userId: user.id,
      action: "delete-poi",
      entityType: "PointOfInterest",
      entityId: poiId,
      detail: { mode: poi.mode, title: poi.title },
    });
  });
  if (poi.imageUrl) await deleteUpload(poi.imageUrl);
  if (poi.imageMobileUrl) await deleteUpload(poi.imageMobileUrl);

  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  return { ok: true };
}
