import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { slugify } from "@/lib/admin/slug";
import { uploadExists } from "@/lib/storage";
import { getBoss, QUEUE_COLOR_ZIP } from "@/lib/queue";

const bodySchema = z.object({
  colorName: z.string().trim().min(1, "El color necesita un nombre").max(60),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido (#RRGGBB)"),
  key: z.string().startsWith("tmp/", "Clave de subida inválida"),
  /** Presente al usar "Reemplazar archivo" sobre un color existente. */
  replaceColorId: z.string().optional(),
});

// Confirma la subida de un ZIP y encola su procesamiento (plan §2.3 pasos
// 2-3). Un solo job activo por color (Req 4) — respaldado además por el
// índice único (vehicleId, colorSlug).
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireAdminUser();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: vehicleId } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { colorName, colorHex, key, replaceColorId } = parsed.data;

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.status === "ARCHIVED") {
    return NextResponse.json({ error: "El vehículo no existe" }, { status: 404 });
  }

  // El ZIP debe existir de verdad en el storage temporal.
  if (!(await uploadExists(key))) {
    return NextResponse.json(
      { error: "La subida no se completó — vuelve a intentar con el archivo" },
      { status: 400 },
    );
  }

  const colorSlug = slugify(colorName);
  if (!colorSlug) {
    return NextResponse.json({ error: "El nombre del color no es válido" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Reemplazo explícito o coincidencia por slug — misma fila, set nuevo.
    const existing = replaceColorId
      ? await tx.vehicleColor.findUnique({ where: { id: replaceColorId } })
      : await tx.vehicleColor.findUnique({
          where: { vehicleId_colorSlug: { vehicleId, colorSlug } },
        });

    if (existing && existing.vehicleId !== vehicleId) {
      return { error: "El color no pertenece a este vehículo" as const };
    }

    if (existing?.activeJobId) {
      const active = await tx.uploadJob.findUnique({ where: { id: existing.activeJobId } });
      if (active && ["QUEUED", "EXTRACTING", "COMPRESSING"].includes(active.status)) {
        // Req 4: un .zip por color — nunca dos jobs activos sobre el mismo.
        return { error: "Este color ya tiene un archivo procesándose — espera a que termine" as const };
      }
    }

    const color = existing
      ? await tx.vehicleColor.update({
          where: { id: existing.id },
          data: { colorName, colorHex },
        })
      : await tx.vehicleColor.create({
          data: {
            vehicleId,
            colorSlug,
            colorName,
            colorHex,
            order: await tx.vehicleColor.count({ where: { vehicleId } }),
          },
        });

    const job = await tx.uploadJob.create({
      data: {
        type: "COLOR_ZIP",
        sourceUrl: `/uploads/${key}`,
        vehicleColorId: color.id,
        vehicleId,
        createdById: user.id,
      },
    });
    await tx.vehicleColor.update({ where: { id: color.id }, data: { activeJobId: job.id } });
    await writeAudit(tx, {
      userId: user.id,
      action: existing ? "replace-color-zip" : "upload-color-zip",
      entityType: "VehicleColor",
      entityId: color.id,
      detail: { vehicle: vehicle.slug, colorSlug, jobId: job.id },
    });
    return { color, job };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const boss = await getBoss();
  await boss.send(QUEUE_COLOR_ZIP, { uploadJobId: result.job.id });

  return NextResponse.json({ colorId: result.color.id, jobId: result.job.id }, { status: 202 });
}
