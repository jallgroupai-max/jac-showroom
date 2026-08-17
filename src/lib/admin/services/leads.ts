import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import { sendLeadToCRM } from "@/lib/crm";
import type { ActionResult } from "@/lib/admin/api-types";
import type { AdminUser } from "@prisma/client";

// Reintento manual de sincronización con el CRM (plan A6): para leads
// FAILED — y también PENDING antiguos, por si el proceso murió entre la
// persistencia y el intento de envío.
export async function retryLeadSync(user: AdminUser, leadId: string): Promise<ActionResult> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "El lead no existe." };
  if (lead.syncStatus === "SENT") return { ok: true };

  let synced = false;
  try {
    const result = await sendLeadToCRM({ vehicleSlug: lead.vehicleSlug, email: lead.email });
    synced = result.ok;
  } catch {
    synced = false;
  }

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: { syncStatus: synced ? "SENT" : "FAILED", syncAttempts: { increment: 1 } },
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
  return synced
    ? { ok: true }
    : { ok: false, error: "El CRM volvió a fallar — el lead queda para reintentar." };
}
