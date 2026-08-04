import { NextResponse } from "next/server";
import type { LeadPayload } from "@/lib/types";

// Mock del endpoint de Odoo — ver docs/TRD.md §6.2.
// "Funcional primero, integrar después": el endpoint real de Odoo está
// pendiente de entrega (bloqueante externo). Este Route Handler simula la
// integración (persistencia local + intento a Odoo) para no bloquear el
// resto del flujo. Reemplazar `sendToOdooMock` por la integración real
// cuando llegue el endpoint, sin tocar el resto de este archivo.

const leadsLog: Array<LeadPayload & { receivedAt: string }> = [];

async function sendToOdooMock(lead: LeadPayload): Promise<{ ok: boolean }> {
  // TODO(Fase 4): reemplazar por el endpoint/payload real de Odoo cuando
  // el equipo correspondiente lo entregue.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[mock-odoo] lead simulado para ${lead.vehicleSlug}: ${lead.email}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { ok: true };
}

export async function POST(request: Request) {
  let body: Partial<LeadPayload>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.fullName || !body.phone || !body.email || !body.vehicleSlug) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 422 });
  }

  const lead = body as LeadPayload;

  // Persistencia local PRIMERO — un lead nunca debe perderse por caída de
  // Odoo (docs/TRD.md §6.2, §7).
  leadsLog.push({ ...lead, receivedAt: new Date().toISOString() });

  const odooResult = await sendToOdooMock(lead);

  return NextResponse.json({ success: true, syncedToOdoo: odooResult.ok });
}
