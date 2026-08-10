import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendLeadToCRM } from "@/lib/crm";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Captura de leads — docs/TRD.md §6.2, ahora con persistencia REAL (Fase A6):
// el lead se guarda en la DB ANTES de intentar el CRM; el resultado del envío
// queda en syncStatus y la bandeja del panel (/admin/leads) permite
// reintentar los fallidos. "Funcional primero, integrar después": el envío a
// Odoo sigue siendo un mock — reemplazar `sendToOdooMock` por la integración
// real cuando llegue el endpoint (Fase 4 del plan público), sin tocar nada más.

const leadSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(160),
  dealerId: z.string().min(1),
  contactChannel: z.enum(["whatsapp", "call", "email"]),
  wantsTestDrive: z.boolean(),
  vehicleSlug: z.string().min(1).max(80),
  vehicleCommercialName: z.string().min(1).max(120),
  vehicleTechnicalName: z.string().min(1).max(120),
  variantColorName: z.string().min(1).max(60),
  origin: z.enum(["mobile", "desktop"]),
});

const CHANNEL_TO_DB = { whatsapp: "WHATSAPP", call: "CALL", email: "EMAIL" } as const;

export async function POST(request: Request) {
  // Anti-spam (TRD §6.1): rate limit por IP — 5 leads cada 10 minutos cubre
  // de sobra cualquier uso humano del formulario.
  const ip = clientIp(request.headers);
  const { allowed } = rateLimit({ key: `leads:${ip}`, limit: 5, windowSeconds: 600 });
  if (!allowed) {
    return NextResponse.json({ error: "Demasiados envíos — intenta en unos minutos" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Honeypot (TRD §6.1): el campo "website" es invisible para humanos; si
  // viene lleno es un bot — se responde éxito SIN persistir, para no darle
  // pistas de que fue detectado.
  if (typeof body === "object" && body !== null && "website" in body && (body as { website?: string }).website) {
    return NextResponse.json({ success: true, syncedToOdoo: true });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 422 });
  }
  const lead = parsed.data;

  // El dealerId del form debe existir — si no (payload manipulado), cae al
  // primer concesionario activo antes que perder el lead.
  const dealer =
    (await prisma.dealer.findUnique({ where: { id: lead.dealerId } })) ??
    (await prisma.dealer.findFirst({ where: { active: true } }));
  if (!dealer) {
    return NextResponse.json({ error: "Sin concesionarios configurados" }, { status: 500 });
  }

  // Persistencia local PRIMERO — un lead nunca se pierde por caída del CRM
  // (TRD §6.2, requisito de resiliencia §8).
  const saved = await prisma.lead.create({
    data: {
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      dealerId: dealer.id,
      contactChannel: CHANNEL_TO_DB[lead.contactChannel],
      wantsTestDrive: lead.wantsTestDrive,
      vehicleSlug: lead.vehicleSlug,
      vehicleCommercialName: lead.vehicleCommercialName,
      vehicleTechnicalName: lead.vehicleTechnicalName,
      variantColorName: lead.variantColorName,
      origin: lead.origin === "mobile" ? "MOBILE" : "DESKTOP",
    },
  });

  let synced = false;
  try {
    const odooResult = await sendLeadToCRM(lead);
    synced = odooResult.ok;
  } catch {
    synced = false;
  }
  await prisma.lead.update({
    where: { id: saved.id },
    data: { syncStatus: synced ? "SENT" : "FAILED", syncAttempts: 1 },
  });

  return NextResponse.json({ success: true, syncedToOdoo: synced });
}
