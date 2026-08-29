import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { sendLeadToCRM } from "@/lib/crm";
import type { ActionResult } from "@/lib/admin/api-types";
import type { AdminUser } from "@prisma/client";

// Eliminación de un lead de la bandeja. Borra SOLO el registro local: si el
// lead ya se sincronizó, la oportunidad sigue viva en Odoo, que es el sistema
// de ventas. Borrarla allá desde acá sería destruir el trabajo del asesor.
export async function deleteLead(user: AdminUser, leadId: string): Promise<ActionResult> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "El lead no existe." };

  await prisma.$transaction(async (tx) => {
    // La auditoría guarda los datos del contacto ANTES de borrarlo: sin esto
    // no queda rastro de qué se eliminó ni de quién era.
    await writeAudit(tx, {
      userId: user.id,
      action: "delete-lead",
      entityType: "Lead",
      entityId: leadId,
      detail: {
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        vehicleSlug: lead.vehicleSlug,
        syncStatus: lead.syncStatus,
        odooLeadId: lead.odooLeadId,
      },
    });
    await tx.lead.delete({ where: { id: leadId } });
  });

  revalidatePath("/admin/leads");
  return { ok: true };
}

// Reintento manual de sincronización con el CRM (plan A6): para leads
// FAILED — y también PENDING antiguos, por si el proceso murió entre la
// persistencia y el intento de envío.
export async function retryLeadSync(user: AdminUser, leadId: string): Promise<ActionResult> {
  // `dealer` viene incluido porque el CRM recibe la ciudad del concesionario.
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { dealer: true },
  });
  if (!lead) return { ok: false, error: "El lead no existe." };
  if (lead.syncStatus === "SENT") return { ok: true };

  let synced = false;
  // Igual que en el alta: se guarda el id de la oportunidad como prueba del
  // envío, para que la bandeja pueda mostrarlo en vez de un "Enviado" a ciegas.
  let odooLeadId: number | null = null;
  // El motivo técnico SÍ se le muestra al administrador: es personal
  // autenticado que necesita saber si falló el CRM o si falta configuración.
  let reason: string | null = null;
  try {
    // Se reenvía el lead COMPLETO: mandar solo vehicleSlug + email creaba una
    // oportunidad sin nombre ni teléfono, inservible para el asesor.
    const result = await sendLeadToCRM({
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      contactChannel: lead.contactChannel,
      wantsTestDrive: lead.wantsTestDrive,
      vehicleSlug: lead.vehicleSlug,
      vehicleCommercialName: lead.vehicleCommercialName,
      vehicleTechnicalName: lead.vehicleTechnicalName,
      variantColorName: lead.variantColorName,
      origin: lead.origin,
      dealerCity: lead.dealer.city,
    });
    synced = result.ok;
    odooLeadId = result.odooLeadId ?? null;
    reason = result.error ?? null;
  } catch (error) {
    synced = false;
    reason = (error as Error).message;
  }

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        syncStatus: synced ? "SENT" : "FAILED",
        syncAttempts: { increment: 1 },
        // Un reintento fallido NO borra el id de un envío anterior.
        ...(odooLeadId !== null ? { odooLeadId } : {}),
      },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "retry-lead-sync",
      entityType: "Lead",
      entityId: leadId,
      detail: { result: synced ? "sent" : "failed" },
    });
  });

  revalidatePath("/admin/leads");
  if (synced) return { ok: true };
  return {
    ok: false,
    error: reason ?? "El CRM volvió a fallar — el lead queda para reintentar.",
  };
}
