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

const exteriorSchema = z.object({
  id: z.string().optional(),
  iconId: z.string().min(1, "Elige un ícono"),
  title: z.string().trim().min(1, "El título es obligatorio").max(80),
  description: z.string().trim().max(400),
  frame: z.coerce.number().int().min(1).max(36),
});

const interiorSchema = z.object({
  id: z.string().optional(),
  iconId: z.string().min(1),
  title: z.string().trim().min(1, "El título es obligatorio").max(80),
  description: z.string().trim().max(400).optional(),
  textureX: z.coerce.number().min(0).max(1),
  textureY: z.coerce.number().min(0).max(1),
  blink: z.enum(["SOFT", "FAST", "NONE"]),
});

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

  // Imagen opcional del panel de detalle — comprimida a WebP al subir
  // (mismo criterio que escenarios; artefacto Req 5).
  let imageUrl = existing?.imageUrl ?? null;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (!IMAGE_TYPES.has(file.type)) {
      return { ok: false, error: "Formato de imagen no soportado — usa JPG, PNG o WebP." };
    }
    let compressed: Buffer;
    try {
      compressed = await sharp(Buffer.from(await file.arrayBuffer()))
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    } catch {
      return { ok: false, error: "El archivo no es una imagen válida." };
    }
    const newUrl = await saveUpload(`poi/${vehicle.slug}/${crypto.randomUUID()}.webp`, compressed);
    if (imageUrl) await deleteUpload(imageUrl);
    imageUrl = newUrl;
  }

  const poi = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.pointOfInterest.update({
          where: { id: existing.id },
          data: {
            iconId: data.iconId,
            title: data.title,
            description: data.description,
            frame: data.frame,
            imageUrl,
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
            imageUrl,
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

export async function saveInteriorPoi(
  vehicleId: string,
  input: z.input<typeof interiorSchema>,
): Promise<ActionResult> {
  const user = await requireAdminUser();
  const parsed = interiorSchema.safeParse(input);
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

  const poi = await prisma.$transaction(async (tx) => {
    const payload = {
      iconId: data.iconId,
      title: data.title,
      description: data.description ?? "",
      textureX: data.textureX,
      textureY: data.textureY,
      blink: data.blink,
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

  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  return { ok: true };
}
