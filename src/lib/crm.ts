// Envío de un lead al CRM — HOY un mock (TRD §6.2, "funcional primero"):
// el endpoint real de Odoo es un bloqueante externo pendiente. Cuando llegue,
// esta función se reemplaza por la integración real y NADA más cambia — la
// llaman /api/leads (alta) y la bandeja del panel (reintento manual).
import type { Lead } from "@prisma/client";

export async function sendLeadToCRM(lead: {
  vehicleSlug: string;
  email: string;
}): Promise<{ ok: boolean }> {
  // TODO(Fase 4 del plan público): endpoint/payload real de Odoo.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[mock-odoo] lead simulado para ${lead.vehicleSlug}: ${lead.email}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { ok: true };
}

export type { Lead };
