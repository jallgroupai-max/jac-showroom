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

// Catálogo de categorías de vehículo (Sedán, Pickup, SUV…). Antes solo lo
// llenaba el seed; ahora se administra desde /admin/categorias.
//
// Dos consumidores con exigencias distintas:
//   · showroom público — pestañas del selector, ordenadas por `order` y solo
//     texto;
//   · panel — tarjetas del paso 1 del wizard y filtros de la biblioteca, que
//     sí muestran el ícono.
// De ahí que el SVG sea opcional: sin él la tarjeta cae a la silueta estática
// por slug, que es lo que ven hoy las cuatro categorías del seed.

const MAX_ICON_BYTES = 64 * 1024;

const nameSchema = z.string().trim().min(1, "El nombre es obligatorio").max(40);
const slugSchema = z
  .string()
  .trim()
  .min(1, "El slug es obligatorio")
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones");

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
    `categories/${crypto.randomUUID()}.svg`,
    Buffer.from(sanitized.svg, "utf8"),
  );
  return { ok: true, url };
}

/** Las categorías se ven en el panel Y en las pestañas del showroom, así que
 * cualquier cambio invalida ambas superficies. */
function revalidateCategoryPages() {
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/vehiculos");
  revalidatePath("/");
}

export async function createCategory(
  user: AdminUser,
  input: { name: unknown; slug?: unknown; file?: unknown },
): Promise<ActionResult> {
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: name.error.issues[0].message };

  // El slug se deriva del nombre salvo que el admin lo escriba: es la clave
  // con la que el showroom identifica la pestaña activa.
  const rawSlug =
    typeof input.slug === "string" && input.slug.trim().length > 0
      ? input.slug
      : slugify(name.data);
  const slug = slugSchema.safeParse(rawSlug);
  if (!slug.success) return { ok: false, error: slug.error.issues[0].message };

  const existing = await prisma.category.findUnique({ where: { slug: slug.data } });
  if (existing) return { ok: false, error: `Ya existe una categoría con el slug «${slug.data}».` };

  let iconUrl: string | null = null;
  if (decodeJsonFile(input.file)) {
    const icon = await saveIcon(input.file);
    if (!icon.ok) return icon;
    iconUrl = icon.url;
  }

  // Al final de la lista: el orden de las pestañas públicas lo decide el
  // admin después, con las flechas.
  const last = await prisma.category.findFirst({ orderBy: { order: "desc" } });

  const category = await prisma.category.create({
    data: { name: name.data, slug: slug.data, iconUrl, order: (last?.order ?? -1) + 1 },
  });
  await writeAudit(prisma, {
    userId: user.id,
    action: "create",
    entityType: "Category",
    entityId: category.id,
    detail: { name: name.data, slug: slug.data },
  });

  revalidateCategoryPages();
  return { ok: true, id: category.id };
}

export async function updateCategory(
  user: AdminUser,
  input: {
    categoryId: unknown;
    name: unknown;
    slug?: unknown;
    file?: unknown;
    removeIcon?: unknown;
  },
): Promise<ActionResult> {
  const categoryId = typeof input.categoryId === "string" ? input.categoryId : "";
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return { ok: false, error: "La categoría no existe." };

  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: name.error.issues[0].message };

  // Cambiar el slug rompe los enlaces que ya apuntan a esa pestaña — se
  // permite (pudo escribirse mal al crearla) pero solo si el admin lo edita a
  // mano; al renombrar la categoría el slug NO se vuelve a derivar.
  const rawSlug =
    typeof input.slug === "string" && input.slug.trim().length > 0
      ? input.slug
      : category.slug;
  const slug = slugSchema.safeParse(rawSlug);
  if (!slug.success) return { ok: false, error: slug.error.issues[0].message };

  if (slug.data !== category.slug) {
    const clash = await prisma.category.findUnique({ where: { slug: slug.data } });
    if (clash) return { ok: false, error: `Ya existe una categoría con el slug «${slug.data}».` };
  }

  let iconUrl = category.iconUrl;
  let iconToDelete: string | null = null;

  if (decodeJsonFile(input.file)) {
    const icon = await saveIcon(input.file);
    if (!icon.ok) return icon;
    iconToDelete = category.iconUrl; // el anterior se borra tras confirmar
    iconUrl = icon.url;
    // Los campos que vienen de un FormData llegan como texto (ver toJson en
    // lib/admin/api.ts), así que se acepta el booleano y su forma serializada.
  } else if (input.removeIcon === true || input.removeIcon === "true") {
    iconToDelete = category.iconUrl;
    iconUrl = null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.category.update({
      where: { id: categoryId },
      data: { name: name.data, slug: slug.data, iconUrl },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "update",
      entityType: "Category",
      entityId: categoryId,
      detail: { name: name.data, slug: slug.data, slugChanged: slug.data !== category.slug },
    });
  });

  // Solo después de que la fila apunte al ícono nuevo — si se borrara antes y
  // la transacción fallara, la BD quedaría con una URL rota.
  if (iconToDelete) await deleteUpload(iconToDelete);

  revalidateCategoryPages();
  return { ok: true, id: categoryId };
}

export async function deleteCategory(user: AdminUser, categoryId: string): Promise<ActionResult> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { vehicles: true } } },
  });
  if (!category) return { ok: false, error: "La categoría no existe." };

  // A diferencia de un escenario, esto NO admite un "eliminar igualmente":
  // Vehicle.categoryId es obligatorio, así que borrar la categoría o falla en
  // la FK o se llevaría los vehículos por delante. El admin tiene que
  // reasignarlos primero — el mensaje se lo dice.
  if (category._count.vehicles > 0) {
    return {
      ok: false,
      error: `Tiene ${category._count.vehicles} ${
        category._count.vehicles === 1 ? "vehículo asignado" : "vehículos asignados"
      } — muévelos a otra categoría antes de eliminarla.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.category.delete({ where: { id: categoryId } });
    await writeAudit(tx, {
      userId: user.id,
      action: "delete",
      entityType: "Category",
      entityId: categoryId,
      detail: { name: category.name, slug: category.slug },
    });
  });
  if (category.iconUrl) await deleteUpload(category.iconUrl);

  revalidateCategoryPages();
  return { ok: true };
}

export async function moveCategory(
  user: AdminUser,
  categoryId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return { ok: false, error: "La categoría no existe." };

  // Intercambio con el vecino inmediato — mismo criterio que moveVehicle.
  const neighbor = await prisma.category.findFirst({
    where: { order: direction === "up" ? { lt: category.order } : { gt: category.order } },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return { ok: true, id: categoryId }; // ya está en el extremo

  await prisma.$transaction(async (tx) => {
    await tx.category.update({ where: { id: category.id }, data: { order: neighbor.order } });
    await tx.category.update({ where: { id: neighbor.id }, data: { order: category.order } });
    await writeAudit(tx, {
      userId: user.id,
      action: "reorder",
      entityType: "Category",
      entityId: categoryId,
      detail: { direction },
    });
  });

  revalidateCategoryPages();
  return { ok: true, id: categoryId };
}
