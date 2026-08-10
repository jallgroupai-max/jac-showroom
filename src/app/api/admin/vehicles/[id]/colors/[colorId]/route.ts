import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { deleteUpload, deleteUploadDir } from "@/lib/storage";

const patchSchema = z.object({
  colorName: z.string().trim().min(1).max(60).optional(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

// Renombrar un color (nombre visible y hex — el colorSlug es identidad de
// carpeta en storage y NO cambia después de creado).
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string; colorId: string }> }) {
  let user;
  try {
    user = await requireAdminUser();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: vehicleId, colorId } = await ctx.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const color = await prisma.vehicleColor.findUnique({ where: { id: colorId } });
  if (!color || color.vehicleId !== vehicleId) {
    return NextResponse.json({ error: "El color no existe" }, { status: 404 });
  }

  await prisma.vehicleColor.update({ where: { id: colorId }, data: parsed.data });
  await writeAudit(prisma, {
    userId: user.id,
    action: "update-color",
    entityType: "VehicleColor",
    entityId: colorId,
    detail: parsed.data,
  });
  return NextResponse.json({ ok: true });
}

// Eliminar un color: bloqueado mientras su job procesa; borra el set del
// storage y el ZIP temporal si quedó de un error.
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string; colorId: string }> }) {
  let user;
  try {
    user = await requireAdminUser();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: vehicleId, colorId } = await ctx.params;
  const color = await prisma.vehicleColor.findUnique({
    where: { id: colorId },
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!color || color.vehicleId !== vehicleId) {
    return NextResponse.json({ error: "El color no existe" }, { status: 404 });
  }

  if (color.activeJobId) {
    const active = await prisma.uploadJob.findUnique({ where: { id: color.activeJobId } });
    if (active && ["QUEUED", "EXTRACTING", "COMPRESSING"].includes(active.status)) {
      return NextResponse.json(
        { error: "Este color tiene un archivo procesándose — espera a que termine" },
        { status: 409 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.vehicleColor.delete({ where: { id: colorId } }); // jobs quedan (SetNull) como historial
    await writeAudit(tx, {
      userId: user.id,
      action: "delete-color",
      entityType: "VehicleColor",
      entityId: colorId,
      detail: { colorSlug: color.colorSlug },
    });
  });

  if (color.spriteBasePath) await deleteUploadDir(color.spriteBasePath);
  const lastJob = color.jobs[0];
  if (lastJob?.sourceUrl) await deleteUpload(lastJob.sourceUrl);

  return NextResponse.json({ ok: true });
}
