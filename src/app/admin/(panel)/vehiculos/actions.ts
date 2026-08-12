"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { saveUpload, deleteUpload } from "@/lib/storage";
import {
  vehicleBasicsSchema,
  vehicleSpecsSchema,
  type VehicleBasicsInput,
  type VehicleSpecsInput,
} from "@/lib/admin/schemas";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

// ————————————————————————————————————————————————————————————————
// Paso 1 — crear el vehículo en borrador (§0.2: el registro existe ANTES de
// poder colgarle assets; los ZIP se suben contra /vehicles/:id/colors).
// ————————————————————————————————————————————————————————————————

export async function createVehicle(input: VehicleBasicsInput): Promise<ActionResult> {
  const user = await requireAdminUser();
  const parsed = vehicleBasicsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  const existing = await prisma.vehicle.findUnique({ where: { slug: data.slug } });
  if (existing) {
    return { ok: false, error: `El slug "${data.slug}" ya está en uso por otro vehículo.` };
  }

  // El nuevo entra al final del orden de su categoría.
  const last = await prisma.vehicle.aggregate({ _max: { order: true } });

  const vehicle = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicle.create({
      data: {
        slug: data.slug,
        commercialName: data.commercialName,
        technicalName: data.technicalName,
        trimLabel: data.trimLabel,
        typeTag: data.typeTag,
        categoryId: data.categoryId,
        order: (last._max.order ?? -1) + 1,
        featureIcons: {
          create: data.iconIds.map((hotspotIconId, order) => ({ hotspotIconId, order })),
        },
      },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "create",
      entityType: "Vehicle",
      entityId: created.id,
      detail: { slug: created.slug, commercialName: created.commercialName },
    });
    return created;
  });

  revalidatePath("/admin/vehiculos");
  return { ok: true, id: vehicle.id };
}

// ————————————————————————————————————————————————————————————————
// Paso 1 — actualizar la ficha base
// ————————————————————————————————————————————————————————————————

export async function updateVehicleBasics(
  vehicleId: string,
  input: VehicleBasicsInput,
): Promise<ActionResult> {
  const user = await requireAdminUser();
  const parsed = vehicleBasicsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "El vehículo no existe." };

  const slug = data.slug;
  if (slug !== vehicle.slug) {
    const clash = await prisma.vehicle.findUnique({ where: { slug } });
    if (clash && clash.id !== vehicleId) {
      return { ok: false, error: `El slug "${slug}" ya está en uso por otro vehículo.` };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.vehicleFeatureIcon.deleteMany({ where: { vehicleId } });
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        slug,
        commercialName: data.commercialName,
        technicalName: data.technicalName,
        trimLabel: data.trimLabel,
        typeTag: data.typeTag,
        categoryId: data.categoryId,
        featureIcons: {
          create: data.iconIds.map((hotspotIconId, order) => ({ hotspotIconId, order })),
        },
      },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "update-basics",
      entityType: "Vehicle",
      entityId: vehicleId,
      detail: { slug },
    });
  });

  revalidatePath("/admin/vehiculos");
  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  return { ok: true, id: vehicleId };
}

// ————————————————————————————————————————————————————————————————
// Paso 1 — foto de perfil del vehículo: la imagen del carrusel "selecciona
// tu vehículo" del showroom público, y la miniatura de la biblioteca de
// vehículos del admin (Vehicle.cardImageUrl). Requiere un vehículo ya
// creado — igual que el fondo propio del paso 6.
// ————————————————————————————————————————————————————————————————

export async function saveVehicleCardImage(vehicleId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireAdminUser();
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.status === "ARCHIVED") return { ok: false, error: "El vehículo no existe." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona una imagen (JPG, PNG o WebP)." };
  }

  let normalized: Buffer;
  try {
    normalized = await sharp(Buffer.from(await file.arrayBuffer()))
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return { ok: false, error: "El archivo no es una imagen válida." };
  }

  const previous = vehicle.cardImageUrl;
  const url = await saveUpload(`card/${vehicle.slug}/${crypto.randomUUID()}.webp`, normalized);
  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { cardImageUrl: url } });
    await writeAudit(tx, {
      userId: user.id,
      action: "upload-card-image",
      entityType: "Vehicle",
      entityId: vehicleId,
      detail: { bytes: file.size },
    });
  });
  if (previous) await deleteUpload(previous);

  revalidatePath("/admin/vehiculos");
  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  return { ok: true };
}

export async function removeVehicleCardImage(vehicleId: string): Promise<ActionResult> {
  const user = await requireAdminUser();
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "El vehículo no existe." };

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { cardImageUrl: null } });
    await writeAudit(tx, {
      userId: user.id,
      action: "remove-card-image",
      entityType: "Vehicle",
      entityId: vehicleId,
    });
  });
  if (vehicle.cardImageUrl) await deleteUpload(vehicle.cardImageUrl);

  revalidatePath("/admin/vehiculos");
  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  return { ok: true };
}

// ————————————————————————————————————————————————————————————————
// Paso 2 — ficha técnica (SpecGroup/SpecItem + garantía)
// ————————————————————————————————————————————————————————————————

export async function saveVehicleSpecs(
  vehicleId: string,
  input: VehicleSpecsInput,
): Promise<ActionResult> {
  const user = await requireAdminUser();
  const parsed = vehicleSpecsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "El vehículo no existe." };

  // Reemplazo completo en transacción: el editor envía la ficha entera, así
  // que el estado final es exactamente lo que se ve en pantalla.
  await prisma.$transaction(async (tx) => {
    await tx.specGroup.deleteMany({ where: { vehicleId } });
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        warrantyLabel: parsed.data.warrantyLabel,
        specGroups: {
          create: [
            {
              title: parsed.data.title,
              order: 0,
              items: {
                create: parsed.data.items.map((item, order) => ({
                  label: item.label,
                  value: item.value,
                  order,
                })),
              },
            },
          ],
        },
      },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "update-specs",
      entityType: "Vehicle",
      entityId: vehicleId,
      detail: { title: parsed.data.title },
    });
  });

  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  return { ok: true, id: vehicleId };
}

// ————————————————————————————————————————————————————————————————
// Transiciones de estado (plan §1.8). Publicar DRAFT→PUBLISHED llega en A5
// con sus guardas (galería completa, specs, slug) — aquí solo lo reversible.
// ————————————————————————————————————————————————————————————————

const TRANSITIONS = {
  pause: { from: "PUBLISHED", to: "PAUSED" },
  republish: { from: "PAUSED", to: "PUBLISHED" },
} as const;

export async function setVehicleStatus(
  vehicleId: string,
  action: keyof typeof TRANSITIONS | "archive",
): Promise<ActionResult> {
  const user = await requireAdminUser();
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "El vehículo no existe." };

  let to: "PAUSED" | "PUBLISHED" | "ARCHIVED";
  if (action === "archive") {
    // Borrado lógico con purga diferida (plan §1.8): conserva registro y
    // assets durante el periodo de gracia; archivedAt marca su inicio.
    to = "ARCHIVED";
  } else {
    const t = TRANSITIONS[action];
    if (vehicle.status !== t.from) {
      return { ok: false, error: `No se puede ${action === "pause" ? "pausar" : "republicar"} desde el estado actual.` };
    }
    to = t.to;
  }

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { status: to, archivedAt: to === "ARCHIVED" ? new Date() : null },
    });
    await writeAudit(tx, {
      userId: user.id,
      action,
      entityType: "Vehicle",
      entityId: vehicleId,
      detail: { from: vehicle.status, to },
    });
  });

  revalidatePath("/admin/vehiculos");
  // Defensa en profundidad: /page.tsx y /[vehicleSlug]/page.tsx ya son
  // force-dynamic (sin caché de servidor), pero un pausado/republicado debe
  // reflejarse igual si eso cambia algún día, o ante el router cache del
  // cliente en una navegación sin recarga dura.
  revalidatePath("/");
  revalidatePath(`/${vehicle.slug}`);
  return { ok: true, id: vehicleId };
}

// ————————————————————————————————————————————————————————————————
// Orden en el catálogo (types.ts: Vehicle.order — hoy no hay otra forma de
// decidir qué vehículo sale primero).
// ————————————————————————————————————————————————————————————————

// ————————————————————————————————————————————————————————————————
// Publicación (Fase A5) — con GUARDAS: lo que le falte al vehículo se
// devuelve como lista accionable, no como un "no se puede" seco.
// ————————————————————————————————————————————————————————————————

export async function getPublishBlockers(vehicleId: string): Promise<string[]> {
  const [vehicle, activeJobs] = await Promise.all([
    prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { colors: true, specGroups: true },
    }),
    prisma.uploadJob.count({
      where: { vehicleId, status: { in: ["QUEUED", "EXTRACTING", "COMPRESSING"] } },
    }),
  ]);
  if (!vehicle) return ["El vehículo no existe."];

  const blockers: string[] = [];
  if (vehicle.colors.length === 0) {
    blockers.push("Sin galería 360°: carga al menos un color (paso 3).");
  } else {
    const pending = vehicle.colors.filter((c) => c.spriteBasePath === null);
    if (pending.length > 0) {
      blockers.push(
        `${pending.length === 1 ? "El color" : "Los colores"} ${pending.map((c) => c.colorName).join(", ")} aún no ${pending.length === 1 ? "tiene" : "tienen"} galería procesada (paso 3).`,
      );
    }
  }
  if (activeJobs > 0) {
    blockers.push("Hay archivos procesándose — espera a que terminen.");
  }
  if (vehicle.specGroups.length === 0) {
    blockers.push("Sin ficha técnica: añade al menos un grupo de especificaciones (paso 2).");
  }
  return blockers;
}

export async function publishVehicle(vehicleId: string): Promise<ActionResult> {
  const user = await requireAdminUser();
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "El vehículo no existe." };
  if (vehicle.status === "PUBLISHED") return { ok: true, id: vehicleId };
  if (vehicle.status === "ARCHIVED") return { ok: false, error: "Un vehículo archivado no se puede publicar." };

  const blockers = await getPublishBlockers(vehicleId);
  if (blockers.length > 0) {
    return { ok: false, error: blockers.join(" ") };
  }

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { status: "PUBLISHED", publishedAt: vehicle.publishedAt ?? new Date() },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "publish",
      entityType: "Vehicle",
      entityId: vehicleId,
      detail: { from: vehicle.status, slug: vehicle.slug },
    });
  });

  revalidatePath("/admin/vehiculos");
  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  // Ver comentario en setVehicleStatus — mismo motivo.
  revalidatePath("/");
  revalidatePath(`/${vehicle.slug}`);
  return { ok: true, id: vehicleId };
}

/** URL de previsualización con token firmado de corta vida (plan §1.8): la
 * única forma de ver un borrador — por URL directa responde 404. */
export async function getPreviewUrl(vehicleId: string): Promise<ActionResult & { url?: string }> {
  await requireAdminUser();
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "El vehículo no existe." };
  const { createPreviewToken } = await import("@/lib/preview-token");
  return { ok: true, url: `/${vehicle.slug}?preview=${createPreviewToken(vehicleId)}` };
}

// ————————————————————————————————————————————————————————————————
// Paso 6 — Escenarios por vehículo (Req 8) y fondo propio (TRD §4.5).
// ————————————————————————————————————————————————————————————————

export async function toggleVehicleScenario(
  vehicleId: string,
  scenarioId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const user = await requireAdminUser();
  const [vehicle, scenario] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: vehicleId } }),
    prisma.scenario.findUnique({ where: { id: scenarioId } }),
  ]);
  if (!vehicle || vehicle.status === "ARCHIVED") return { ok: false, error: "El vehículo no existe." };
  if (!scenario) return { ok: false, error: "El escenario no existe." };

  await prisma.$transaction(async (tx) => {
    await tx.vehicleScenario.upsert({
      where: { vehicleId_scenarioId: { vehicleId, scenarioId } },
      update: { enabled },
      create: { vehicleId, scenarioId, enabled },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: enabled ? "enable-scenario" : "disable-scenario",
      entityType: "Vehicle",
      entityId: vehicleId,
      detail: { scenario: scenario.label },
    });
  });

  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  revalidatePath("/admin/escenarios"); // "usado en N vehículos"
  return { ok: true };
}

// Fondo "propio" del vehículo — el default del selector de Escena del
// showroom (TRD §4.5): distinto por modelo, no viene del catálogo global.
export async function saveOwnBackground(vehicleId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireAdminUser();
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.status === "ARCHIVED") return { ok: false, error: "El vehículo no existe." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona una imagen (JPG, PNG o WebP)." };
  }

  let normalized: Buffer;
  try {
    normalized = await sharp(Buffer.from(await file.arrayBuffer()))
      .resize({ width: 3840, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return { ok: false, error: "El archivo no es una imagen válida." };
  }

  const previous = vehicle.ownBackgroundUrl;
  const url = await saveUpload(
    `backgrounds/${vehicle.slug}/${crypto.randomUUID()}.webp`,
    normalized,
  );
  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { ownBackgroundUrl: url } });
    await writeAudit(tx, {
      userId: user.id,
      action: "upload-own-background",
      entityType: "Vehicle",
      entityId: vehicleId,
      detail: { bytes: file.size },
    });
  });
  if (previous) await deleteUpload(previous);

  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  return { ok: true };
}

export async function removeOwnBackground(vehicleId: string): Promise<ActionResult> {
  const user = await requireAdminUser();
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "El vehículo no existe." };

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { ownBackgroundUrl: null } });
    await writeAudit(tx, {
      userId: user.id,
      action: "remove-own-background",
      entityType: "Vehicle",
      entityId: vehicleId,
    });
  });
  if (vehicle.ownBackgroundUrl) await deleteUpload(vehicle.ownBackgroundUrl);

  revalidatePath(`/admin/vehiculos/${vehicleId}`);
  return { ok: true };
}

// ————————————————————————————————————————————————————————————————
// Orden en el catálogo (types.ts: Vehicle.order — hoy no hay otra forma de
// decidir qué vehículo sale primero).
// ————————————————————————————————————————————————————————————————

export async function moveVehicle(vehicleId: string, direction: "up" | "down"): Promise<ActionResult> {
  const user = await requireAdminUser();
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "El vehículo no existe." };

  // El vecino inmediato en el orden global (mismo criterio que el catálogo
  // público: order ascendente).
  const neighbor = await prisma.vehicle.findFirst({
    where: {
      status: { not: "ARCHIVED" },
      order: direction === "up" ? { lt: vehicle.order } : { gt: vehicle.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return { ok: true, id: vehicleId }; // ya está en el extremo

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicle.id }, data: { order: neighbor.order } });
    await tx.vehicle.update({ where: { id: neighbor.id }, data: { order: vehicle.order } });
    await writeAudit(tx, {
      userId: user.id,
      action: "reorder",
      entityType: "Vehicle",
      entityId: vehicleId,
      detail: { direction },
    });
  });

  revalidatePath("/admin/vehiculos");
  return { ok: true, id: vehicleId };
}
