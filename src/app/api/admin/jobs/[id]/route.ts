import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Estado de un job para el polling del wizard (plan §2.3 paso 4). Incluye la
// posición en cola: "en cola (3.º)" comunica más que una barra congelada.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const job = await prisma.uploadJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "El trabajo no existe" }, { status: 404 });

  let queuePosition: number | null = null;
  if (job.status === "QUEUED") {
    queuePosition =
      (await prisma.uploadJob.count({
        where: { status: "QUEUED", createdAt: { lt: job.createdAt } },
      })) + 1;
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    errorMessage: job.errorMessage,
    errorKind: job.errorKind,
    attempts: job.attempts,
    queuePosition,
  });
}
