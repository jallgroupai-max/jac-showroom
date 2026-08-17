import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { saveUpload, deleteUpload } from "@/lib/storage";
import { decodeJsonFile } from "@/lib/admin/json-file";
import type { ActionResult } from "@/lib/admin/api-types";
import type { AdminUser } from "@prisma/client";

// Catálogo global de escenarios (plan §1.7): DOS tipos de entrada — imagen
// (foto de ambiente) o color sólido (paleta neutra que el showroom ya
// soporta). Exactamente uno de los dos.

const labelSchema = z.string().trim().min(1, "El nombre es obligatorio").max(80);
const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido (formato #RRGGBB)");

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function createScenario(
  user: AdminUser,
  input: { label: unknown; kind: unknown; color?: unknown; file?: unknown },
): Promise<ActionResult> {
  const label = labelSchema.safeParse(input.label);
  if (!label.success) return { ok: false, error: label.error.issues[0].message };

  if (input.kind === "color") {
    const color = hexSchema.safeParse(input.color);
    if (!color.success) return { ok: false, error: color.error.issues[0].message };

    const scenario = await prisma.scenario.create({
      data: { label: label.data, color: color.data },
    });
    await writeAudit(prisma, {
      userId: user.id,
      action: "create",
      entityType: "Scenario",
      entityId: scenario.id,
      detail: { label: label.data, kind: "color" },
    });
  } else if (input.kind === "image") {
    const file = decodeJsonFile(input.file);
    if (!file) {
      return { ok: false, error: "Selecciona una imagen (JPG, PNG o WebP)." };
    }
    if (!IMAGE_TYPES[file.type]) {
      return { ok: false, error: "Formato no soportado — usa JPG, PNG o WebP." };
    }

    // Normalización a WebP (plan A2): valida que sea imagen real, capa el
    // ancho a 3840 (resolución recomendada del prototipo) y unifica formato.
    let normalized: Buffer;
    try {
      normalized = await sharp(file.buffer)
        .resize({ width: 3840, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      return { ok: false, error: "El archivo no es una imagen válida." };
    }

    const key = `scenarios/${crypto.randomUUID()}.webp`;
    const imageUrl = await saveUpload(key, normalized);

    const scenario = await prisma.scenario.create({ data: { label: label.data, imageUrl } });
    await writeAudit(prisma, {
      userId: user.id,
      action: "create",
      entityType: "Scenario",
      entityId: scenario.id,
      detail: { label: label.data, kind: "image", bytes: file.buffer.length },
    });
  } else {
    return { ok: false, error: "Tipo de escenario desconocido." };
  }

  revalidatePath("/admin/escenarios");
  return { ok: true };
}

export async function deleteScenario(
  user: AdminUser,
  scenarioId: string,
  force: boolean,
): Promise<ActionResult> {
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: { _count: { select: { vehicles: true } } },
  });
  if (!scenario) return { ok: false, error: "El escenario no existe." };

  // Guarda de borrado (plan A1): si está en uso, el llamador tiene que
  // confirmar sabiendo el impacto — nunca un borrado silencioso en cadena.
  if (scenario._count.vehicles > 0 && !force) {
    return {
      ok: false,
      error: `Está asignado a ${scenario._count.vehicles} ${
        scenario._count.vehicles === 1 ? "vehículo" : "vehículos"
      } — confirma para eliminarlo de todos.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.scenario.delete({ where: { id: scenarioId } }); // cascade borra VehicleScenario
    await writeAudit(tx, {
      userId: user.id,
      action: "delete",
      entityType: "Scenario",
      entityId: scenarioId,
      detail: { label: scenario.label, usedBy: scenario._count.vehicles },
    });
  });
  if (scenario.imageUrl) await deleteUpload(scenario.imageUrl);

  revalidatePath("/admin/escenarios");
  return { ok: true };
}
