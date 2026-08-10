import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Export CSV de la bandeja de leads (plan A6). UTF-8 con BOM para que Excel
// abra los acentos bien.
export async function GET() {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    include: { dealer: true },
  });

  const header = [
    "Fecha",
    "Nombre",
    "Teléfono",
    "Correo",
    "Concesionario",
    "Canal",
    "Prueba de manejo",
    "Vehículo (comercial)",
    "Vehículo (técnico)",
    "Color",
    "Origen",
    "Estado CRM",
    "Intentos",
  ];

  const rows = leads.map((l) => [
    l.createdAt.toISOString(),
    l.fullName,
    l.phone,
    l.email,
    l.dealer.city,
    l.contactChannel,
    l.wantsTestDrive ? "Sí" : "No",
    l.vehicleCommercialName,
    l.vehicleTechnicalName,
    l.variantColorName,
    l.origin,
    l.syncStatus,
    String(l.syncAttempts),
  ]);

  const escape = (value: string) =>
    /[",\n;]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  const csv = [header, ...rows].map((row) => row.map(escape).join(";")).join("\r\n");

  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
