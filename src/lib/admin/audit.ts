import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Bitácora (plan §2.1): con permisos planos es la única forma de reconstruir
// quién hizo qué. Se escribe en la misma transacción cuando importa la
// atomicidad, o suelta cuando no.
export function writeAudit(
  tx: Prisma.TransactionClient | typeof prisma,
  entry: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    detail?: Prisma.InputJsonValue;
  },
) {
  return tx.auditLog.create({ data: entry });
}
