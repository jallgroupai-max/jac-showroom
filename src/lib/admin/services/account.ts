import { revalidatePath } from "next/cache";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/admin/audit";
import type { ActionResult } from "@/lib/admin/api-types";
import type { AdminUser } from "@prisma/client";

// Cuenta del administrador — decisión de producto: este panel tiene UN solo
// tipo de usuario (administra el showroom y nada más), así que no hay gestión
// de usuarios: solo editar la cuenta propia. La bitácora sigue registrando
// cada acción en la DB.
//
// La sesión ya la validó adminJsonRoute; aquí llega el actor resuelto.

const profileSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  email: z.string().trim().email("Correo inválido").max(160),
});

export async function updateOwnProfile(
  actor: AdminUser,
  input: { name: unknown; email: unknown },
): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const email = parsed.data.email.toLowerCase();
  const clash = await prisma.adminUser.findUnique({ where: { email } });
  if (clash && clash.id !== actor.id) {
    return { ok: false, error: "Ese correo ya está en uso." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({
      where: { id: actor.id },
      data: { name: parsed.data.name, email },
    });
    await writeAudit(tx, {
      userId: actor.id,
      action: "update-profile",
      entityType: "AdminUser",
      entityId: actor.id,
      detail: { email },
    });
  });

  revalidatePath("/admin", "layout");
  return { ok: true };
}

const passwordSchema = z.object({
  current: z.string().min(1, "Escribe tu contraseña actual"),
  next: z.string().min(8, "La nueva debe tener mínimo 8 caracteres").max(200),
});

export async function changeOwnPassword(
  actor: AdminUser,
  input: { current: unknown; next: unknown },
): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const valid = await verify(actor.passwordHash, parsed.data.current);
  if (!valid) return { ok: false, error: "La contraseña actual no coincide." };

  await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({
      where: { id: actor.id },
      data: { passwordHash: await hash(parsed.data.next) },
    });
    await writeAudit(tx, {
      userId: actor.id,
      action: "change-password",
      entityType: "AdminUser",
      entityId: actor.id,
    });
  });

  return { ok: true };
}
