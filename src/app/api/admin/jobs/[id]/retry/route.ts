import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { getBoss, QUEUE_COLOR_ZIP } from "@/lib/queue";

// Reintento MANUAL (plan §2.4): siempre disponible en un job en ERROR —
// incluso agotados los automáticos, la causa puede haberse resuelto fuera
// (storage restablecido, cuota ampliada). No re-sube nada: el ZIP fuente
// sigue en el storage temporal.
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireAdminUser();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const job = await prisma.uploadJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "El trabajo no existe" }, { status: 404 });
  if (job.status !== "ERROR") {
    return NextResponse.json({ error: "Solo se puede reintentar un trabajo fallido" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.uploadJob.update({
      where: { id },
      data: { status: "QUEUED", progress: 0, errorMessage: null, errorKind: null, finishedAt: null },
    });
    if (job.vehicleColorId) {
      await tx.vehicleColor.update({
        where: { id: job.vehicleColorId },
        data: { activeJobId: id },
      });
    }
    await writeAudit(tx, {
      userId: user.id,
      action: "retry-job",
      entityType: "UploadJob",
      entityId: id,
      detail: { attempts: job.attempts },
    });
  });

  const boss = await getBoss();
  await boss.send(QUEUE_COLOR_ZIP, { uploadJobId: id });

  return NextResponse.json({ ok: true }, { status: 202 });
}
