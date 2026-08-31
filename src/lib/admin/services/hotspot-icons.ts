import { readdir } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { saveUpload, deleteUpload } from "@/lib/storage";
import { decodeJsonFile } from "@/lib/admin/json-file";
import { sanitizeSvg } from "@/lib/admin/svg-sanitize";
import { slugify } from "@/lib/admin/slug";
import type { ActionResult } from "@/lib/admin/api-types";
import type { AdminUser } from "@prisma/client";

// Catálogo de íconos (plan §1.2: un catálogo, dos usos — característica de la
// card y punto de interés). Hasta ahora solo lo llenaban los seeds; se
// administra desde /admin/iconos.
//
// Un ícono resuelve su dibujo en este orden (ver iconRef en lib/data/catalog.ts
// y HotspotIconImage en el panel):
//   1. iconUrl   — SVG subido desde el panel;
//   2. assetName — archivo de /public/assets/icons (los del diseño original);
//   3. svgPath   — path 24×24 de respaldo.
// La prioridad de iconUrl es lo que permite reemplazar el dibujo de un ícono
// del seed sin tocar los archivos del repo.

const MAX_ICON_BYTES = 64 * 1024;

/** Carpeta de los SVG de diseño que ya viven en el repo. */
const ASSET_ICONS_DIR = path.join(process.cwd(), "public", "assets", "icons");

const GROUPS = ["EXTERIOR", "INTERIOR", "GENERAL"] as const;
export type IconGroup = (typeof GROUPS)[number];

const labelSchema = z.string().trim().min(1, "El nombre es obligatorio").max(40);
const groupSchema = z.enum(GROUPS, { message: "Grupo inválido" });
const keySchema = z
  .string()
  .trim()
  .min(1, "La clave es obligatoria")
  .max(60)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, "Solo minúsculas, números, guiones y guiones bajos");

/**
 * SVG de /public/assets/icons que TODAVÍA no están en el catálogo. Son los
 * íconos de diseño que el repo ya trae (45 archivos) pero que los seeds nunca
 * dieron de alta: ofrecerlos al crear ahorra volver a dibujarlos y es la vía
 * más barata de ampliar el catálogo.
 */
export async function listAvailableAssetIcons(): Promise<string[]> {
  let files: string[];
  try {
    files = await readdir(ASSET_ICONS_DIR);
  } catch {
    return []; // sin carpeta de assets el panel sigue funcionando, solo sin biblioteca
  }

  const used = new Set(
    (await prisma.hotspotIcon.findMany({ select: { assetName: true } }))
      .map((i) => i.assetName)
      .filter((name): name is string => name !== null),
  );

  return files
    .filter((f) => f.toLowerCase().endsWith(".svg"))
    .map((f) => f.slice(0, -4))
    .filter((name) => !used.has(name))
    .sort();
}

/** Valida y guarda el SVG subido; devuelve su URL pública. */
async function saveIcon(
  input: unknown,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const file = decodeJsonFile(input);
  if (!file) return { ok: false, error: "Selecciona un archivo SVG." };

  // El tipo MIME lo pone el navegador y es orientativo; la verificación real
  // es que el contenido parsee como SVG (lo comprueba sanitizeSvg).
  if (file.type && file.type !== "image/svg+xml") {
    return { ok: false, error: "El ícono debe ser un archivo SVG." };
  }
  if (file.buffer.length > MAX_ICON_BYTES) {
    return { ok: false, error: "El SVG supera los 64 KB — usa un ícono más simple." };
  }

  const sanitized = sanitizeSvg(file.buffer.toString("utf8"));
  if (!sanitized.ok) return sanitized;

  const url = await saveUpload(
    `icons/${crypto.randomUUID()}.svg`,
    Buffer.from(sanitized.svg, "utf8"),
  );
  return { ok: true, url };
}

/** Los íconos se ven en el panel Y en el showroom (chips de la card, marcadores
 * de los puntos de interés), así que un cambio invalida ambas superficies. */
function revalidateIconPages() {
  revalidatePath("/admin/iconos");
  revalidatePath("/admin/vehiculos");
  revalidatePath("/");
}

/** Clave única y estable a partir del nombre — con sufijo si ya existe, para
 * que dos íconos llamados igual en grupos distintos no choquen. */
async function uniqueKey(base: string): Promise<string> {
  const root = slugify(base) || "icono";
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    const clash = await prisma.hotspotIcon.findUnique({ where: { key: candidate } });
    if (!clash) return candidate;
  }
  return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createHotspotIcon(
  user: AdminUser,
  input: { label: unknown; group: unknown; source?: unknown; assetName?: unknown; file?: unknown },
): Promise<ActionResult> {
  const label = labelSchema.safeParse(input.label);
  if (!label.success) return { ok: false, error: label.error.issues[0].message };

  const group = groupSchema.safeParse(input.group);
  if (!group.success) return { ok: false, error: group.error.issues[0].message };

  let assetName: string | null = null;
  let iconUrl: string | null = null;

  if (input.source === "library") {
    // Solo se acepta un nombre que esté REALMENTE disponible: así el cuerpo
    // JSON no puede apuntar a un archivo arbitrario del disco ni duplicar un
    // asset que ya está en el catálogo.
    const requested = keySchema.safeParse(input.assetName);
    if (!requested.success) return { ok: false, error: "Elige un ícono de la biblioteca." };

    const available = await listAvailableAssetIcons();
    if (!available.includes(requested.data)) {
      return { ok: false, error: "Ese ícono ya está en el catálogo o no existe." };
    }
    assetName = requested.data;
  } else {
    const icon = await saveIcon(input.file);
    if (!icon.ok) return icon;
    iconUrl = icon.url;
  }

  const key = await uniqueKey(assetName ?? label.data);
  const last = await prisma.hotspotIcon.findFirst({ orderBy: { order: "desc" } });

  const created = await prisma.hotspotIcon.create({
    data: {
      key,
      label: label.data,
      group: group.data,
      assetName,
      iconUrl,
      order: (last?.order ?? -1) + 1,
    },
  });
  await writeAudit(prisma, {
    userId: user.id,
    action: "create",
    entityType: "HotspotIcon",
    entityId: created.id,
    detail: { label: label.data, group: group.data, source: assetName ? "library" : "upload" },
  });

  revalidateIconPages();
  return { ok: true, id: created.id };
}

export async function updateHotspotIcon(
  user: AdminUser,
  input: { iconId: unknown; label: unknown; group: unknown; file?: unknown; removeIcon?: unknown },
): Promise<ActionResult> {
  const iconId = typeof input.iconId === "string" ? input.iconId : "";
  const icon = await prisma.hotspotIcon.findUnique({ where: { id: iconId } });
  if (!icon) return { ok: false, error: "El ícono no existe." };

  const label = labelSchema.safeParse(input.label);
  if (!label.success) return { ok: false, error: label.error.issues[0].message };

  const group = groupSchema.safeParse(input.group);
  if (!group.success) return { ok: false, error: group.error.issues[0].message };

  let iconUrl = icon.iconUrl;
  let toDelete: string | null = null;

  if (decodeJsonFile(input.file)) {
    const saved = await saveIcon(input.file);
    if (!saved.ok) return saved;
    toDelete = icon.iconUrl; // el anterior se borra tras confirmar el cambio
    iconUrl = saved.url;
    // Los campos que vienen de un FormData llegan como texto (ver toJson en
    // lib/admin/api.ts), así que se acepta el booleano y su forma serializada.
  } else if (input.removeIcon === true || input.removeIcon === "true") {
    // Quitar el SVG subido NO deja el ícono sin dibujo: vuelve a caer en
    // assetName o svgPath, que es exactamente lo que se quiere al deshacer un
    // reemplazo sobre un ícono del seed.
    toDelete = icon.iconUrl;
    iconUrl = null;
  }

  if (!iconUrl && !icon.assetName && icon.svgPath.length === 0) {
    return { ok: false, error: "El ícono se quedaría sin dibujo — sube un SVG." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.hotspotIcon.update({
      where: { id: iconId },
      data: { label: label.data, group: group.data, iconUrl },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "update",
      entityType: "HotspotIcon",
      entityId: iconId,
      detail: { label: label.data, group: group.data },
    });
  });

  // Solo después de que la fila apunte al ícono nuevo — si se borrara antes y
  // la transacción fallara, la BD quedaría con una URL rota.
  if (toDelete) await deleteUpload(toDelete);

  revalidateIconPages();
  return { ok: true, id: iconId };
}

export async function deleteHotspotIcon(
  user: AdminUser,
  iconId: string,
): Promise<ActionResult> {
  const icon = await prisma.hotspotIcon.findUnique({
    where: { id: iconId },
    include: { _count: { select: { pointsOfInterest: true, vehicleFeatures: true } } },
  });
  if (!icon) return { ok: false, error: "El ícono no existe." };

  // Como con las categorías, esto NO admite un "eliminar igualmente":
  // PointOfInterest.iconId es obligatorio, así que borrar el ícono o falla en
  // la FK o se llevaría por delante puntos de interés ya publicados.
  const pois = icon._count.pointsOfInterest;
  const features = icon._count.vehicleFeatures;
  if (pois > 0 || features > 0) {
    const uses = [
      pois > 0 ? `${pois} ${pois === 1 ? "punto de interés" : "puntos de interés"}` : null,
      features > 0 ? `${features} ${features === 1 ? "vehículo" : "vehículos"}` : null,
    ].filter(Boolean);
    return {
      ok: false,
      error: `En uso por ${uses.join(" y ")} — quítalo de ahí antes de eliminarlo.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.hotspotIcon.delete({ where: { id: iconId } });
    await writeAudit(tx, {
      userId: user.id,
      action: "delete",
      entityType: "HotspotIcon",
      entityId: iconId,
      detail: { label: icon.label, group: icon.group, key: icon.key },
    });
  });
  // Solo el SVG subido: los archivos de /public/assets/icons son del repo y
  // pueden volver a darse de alta desde la biblioteca.
  if (icon.iconUrl) await deleteUpload(icon.iconUrl);

  revalidateIconPages();
  return { ok: true };
}
