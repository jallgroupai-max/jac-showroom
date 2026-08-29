// Envío de un lead al CRM Odoo (TRD §6.2). Sustituye al mock de las fases
// anteriores; la llaman /api/leads (alta) y la bandeja del panel (reintento
// manual desde /admin/leads).
//
// Crea DOS registros en Odoo:
//   1. `res.partner` — el contacto. Se reutiliza si ya existe (dedupe por
//      teléfono o correo); solo se crea uno nuevo cuando no hay coincidencia.
//   2. `crm.lead`    — la oportunidad, siempre nueva y ligada a ese contacto.
//      Dos consultas del mismo interesado son dos oportunidades: es lo que
//      quiere ventas para no perder seguimientos.
//
// Sobre el contrato "sugerido" por el lado de Odoo: pedía documento (V-1234…),
// estado y monto esperado. Nada de eso lo captura el formulario "Me interesa
// este vehículo" — y en Odoo solo `name` y `type` son obligatorios, así que se
// omiten en vez de inventarlos. Si algún día el formulario pide cédula/RIF, el
// dedupe de contactos debería mudarse a `vat`, que es más confiable que el
// teléfono.
export type { Lead } from "@prisma/client";
import { execute, normalizeCreatedId, odooUnavailableReason, OdooError } from "@/lib/odoo";

/** Lo que el formulario captura hoy. Es también lo que persiste el modelo Lead. */
export interface CrmLeadInput {
  fullName: string;
  phone: string;
  email: string;
  /** "whatsapp" | "call" | "email" del form, o el enum en mayúsculas de la DB. */
  contactChannel: string;
  wantsTestDrive: boolean;
  vehicleSlug: string;
  vehicleCommercialName: string;
  vehicleTechnicalName: string;
  variantColorName: string;
  /** "mobile" | "desktop", o el enum en mayúsculas de la DB. */
  origin: string;
  /** Ciudad del concesionario elegido — hoy siempre Barquisimeto. */
  dealerCity?: string;
}

export interface CrmResult {
  ok: boolean;
  /** Id de la oportunidad creada en Odoo, para auditar. */
  odooLeadId?: number;
  /** Motivo técnico del fallo — para el log del servidor, NO para el usuario. */
  error?: string;
}

// Venezuela. El input de teléfono es texto libre (placeholder "+58 000 000
// 0000"), así que el prefijo se asume acá en vez de pedirle al usuario un
// selector de país que hoy tendría una sola opción.
const COUNTRY_CODE = "+58";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  call: "Llamada",
  email: "Correo",
};

/**
 * Normaliza el teléfono a formato internacional pegado: "0412-0123456",
 * "+58 412 0123456" y "4120123456" colapsan todos a "+584120123456".
 * Sin esto el dedupe de contactos fallaría por diferencias de formato.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  // Ya trae el código de país.
  if (digits.startsWith("58")) return `${COUNTRY_CODE}${digits.slice(2).replace(/^0+/, "")}`;
  // Formato local: el 0 inicial se pierde al internacionalizar.
  return `${COUNTRY_CODE}${digits.replace(/^0+/, "")}`;
}

// Un número venezolano son 10 dígitos después del +58: móviles que empiezan
// en 4 (412, 414, 416, 422, 424, 426) y fijos que empiezan en 2 (0212, 0251…).
// La regla sale de los datos del propio CRM: 81.234 contactos siguen esta
// forma contra 4.565 con longitudes sueltas, y Odoo tiene una validación que
// rechaza el resto con "El número de telefónico no posee el formato correcto".
const VE_PHONE = /^\+58[24]\d{9}$/;

export function isValidVePhone(normalized: string): boolean {
  return VE_PHONE.test(normalized);
}

/** Asunto de la oportunidad — autogenerado, el usuario no lo escribe. */
function buildLeadName(lead: CrmLeadInput): string {
  return `Showroom 360 - ${lead.vehicleCommercialName} - ${lead.fullName}`;
}

/**
 * Todo lo que el formulario captura y no tiene un campo propio en `crm.lead`
 * va acá para que el asesor lo vea al abrir la oportunidad. `description` es
 * un campo HTML en Odoo: los saltos de línea tienen que ser `<br>` o el texto
 * sale todo pegado.
 */
function buildDescription(lead: CrmLeadInput): string {
  const channel = CHANNEL_LABELS[lead.contactChannel.toLowerCase()] ?? lead.contactChannel;
  return [
    `<p><b>Vehículo:</b> ${lead.vehicleCommercialName} (${lead.vehicleTechnicalName})`,
    `<br><b>Color:</b> ${lead.variantColorName}`,
    `<br><b>Test drive:</b> ${lead.wantsTestDrive ? "Sí, lo solicita" : "No"}`,
    `<br><b>Canal preferido:</b> ${channel}`,
    `<br><b>Concesionario:</b> ${lead.dealerCity ?? "—"}`,
    `<br><b>Origen:</b> ${lead.origin.toLowerCase() === "mobile" ? "Móvil" : "Escritorio"}`,
    `<br><b>Referencia:</b> ${lead.vehicleSlug}</p>`,
  ].join("");
}

type PartnerRow = { id: number; name?: string | false; phone?: string | false; email?: string | false };

/**
 * Busca un contacto existente por teléfono o correo y, si no hay, lo crea.
 * Devuelve siempre un id utilizable.
 */
async function findOrCreatePartner(lead: CrmLeadInput, phone: string): Promise<number> {
  // El dedupe por documento que sugería la guía no aplica: no lo capturamos.
  // Teléfono y correo son lo que hay, y cubren el caso real (misma persona
  // consultando por un segundo vehículo).
  const domain: unknown[] = ["|", "|", ["phone", "=", phone], ["mobile", "=", phone]];
  domain.push(["email", "=ilike", lead.email]);

  const found = await execute<PartnerRow[]>("res.partner", "search_read", domain, [
    "id",
    "name",
    "phone",
    "email",
  ]);

  if (found.length > 0) {
    const partner = found[0];
    // Completar huecos SIN pisar lo que el CRM ya tenía: los datos cargados
    // por un asesor valen más que los de un formulario web.
    const patch: Record<string, string> = {};
    if (!partner.name) patch.name = lead.fullName;
    if (!partner.phone) patch.phone = phone;
    if (!partner.email) patch.email = lead.email;
    if (Object.keys(patch).length > 0) {
      await execute("res.partner", "write", [partner.id], patch);
    }
    return partner.id;
  }

  const created = await execute("res.partner", "create", {
    name: lead.fullName,
    phone,
    email: lead.email,
    // El showroom vende a personas naturales; si algún día entra un formulario
    // B2B, esto sale del payload del form.
    company_type: "person",
    ...(lead.dealerCity ? { city: lead.dealerCity } : {}),
  });
  return normalizeCreatedId(created);
}

/**
 * Envía el lead a Odoo. NUNCA lanza: el lead ya está persistido en Postgres y
 * un fallo del CRM solo debe marcarlo como reintentable, no romper el request.
 */
export async function sendLeadToCRM(lead: CrmLeadInput): Promise<CrmResult> {
  const unavailable = odooUnavailableReason();
  if (unavailable) {
    // Apagado a propósito (ODOO_ENABLED=false) o mal configurado. Se devuelve
    // ok:false para que el lead quede FAILED y la bandeja lo ofrezca para
    // reintentar cuando la integración se encienda — marcarlo SENT sin haberlo
    // enviado es lo que hacía el mock, y dejaba leads perdidos en silencio.
    // El motivo viaja en `error` para que el panel no diga "el CRM falló"
    // cuando en realidad nunca se intentó contactarlo.
    return { ok: false, error: unavailable };
  }

  const phone = normalizePhone(lead.phone);
  // Se valida ANTES de salir a la red: Odoo rechazaría el número igual, pero
  // con un mensaje que no dice cuál de los dos registros lo causó ni por qué.
  // Fallar acá ahorra el viaje y explica el problema en términos accionables.
  if (!isValidVePhone(phone)) {
    return {
      ok: false,
      error: `El teléfono «${lead.phone}» no es válido: Odoo espera +58 y 10 dígitos (ej. +584141234567), y este tiene ${phone.replace(/\D/g, "").length - 2}.`,
    };
  }

  try {
    const partnerId = await findOrCreatePartner(lead, phone);

    const created = await execute("crm.lead", "create", {
      name: buildLeadName(lead),
      // `type` y `name` son los dos únicos campos obligatorios de crm.lead.
      // "opportunity" la manda directo al pipeline de ventas; "lead" la
      // dejaría en la bandeja previa de calificación.
      type: "opportunity",
      partner_id: partnerId,
      contact_name: lead.fullName,
      phone,
      email_from: lead.email,
      company_type: "person",
      description: buildDescription(lead),
      ...(lead.dealerCity ? { city: lead.dealerCity } : {}),
      // Sin equipo, Odoo aplica sus propias reglas de asignación.
      ...(process.env.ODOO_TEAM_ID ? { team_id: Number(process.env.ODOO_TEAM_ID) } : {}),
    });

    return { ok: true, odooLeadId: normalizeCreatedId(created) };
  } catch (error) {
    // El mensaje crudo de Odoo se loguea, nunca se le muestra al visitante:
    // puede filtrar nombres de modelos, campos y reglas internas.
    const message = error instanceof OdooError ? error.message : (error as Error).message;
    console.error(`[odoo] fallo al crear lead de ${lead.vehicleSlug}: ${message}`);
    return { ok: false, error: message };
  }
}

