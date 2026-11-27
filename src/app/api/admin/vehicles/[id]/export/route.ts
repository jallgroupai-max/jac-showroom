import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { prepareVehicleExport, vehicleZipStream } from "@/lib/admin/vehicle-package/export";

// Descarga del vehículo completo como .zip (formato en lib/admin/vehicle-package/format.ts).
// Respuesta en streaming: el zip se genera mientras se envía. SIN base64: el
// problema del FortiWeb (firma Log4Shell por azar en bytes binarios) afecta a
// los BODIES DE REQUEST que sube el cliente; las descargas binarias (los
// sprites ya se sirven así desde /uploads) pasan sin tocarse. Si el WAF llegara
// a bloquear también respuestas, habría que codificar aquí y decodificar en el
// cliente — hoy no hay evidencia de eso.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireAdminUser();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const prepared = await prepareVehicleExport(id);
  if (!prepared) return NextResponse.json({ error: "El vehículo no existe" }, { status: 404 });

  await writeAudit(prisma, {
    userId: user.id,
    action: "export-vehicle",
    entityType: "Vehicle",
    entityId: id,
    detail: {
      slug: prepared.slug,
      files: prepared.assets.length,
      ...(prepared.manifest.warnings ? { warnings: prepared.manifest.warnings } : {}),
    },
  });

  return new Response(Readable.toWeb(vehicleZipStream(prepared)) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="jac-vehicle-${prepared.slug}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
