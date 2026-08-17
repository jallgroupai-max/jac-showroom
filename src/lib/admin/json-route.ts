import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import type { ActionResult } from "./api-types";

type AdminUser = Awaited<ReturnType<typeof requireAdminUser>>;
type JsonBody = Record<string, unknown>;

/**
 * Envoltorio de todo Route Handler de mutación del panel (plan A7 — hotfix
 * WAF: reemplazan a las Server Actions, cuyo multipart con campos
 * `$ACTION_REF`/`$ACTION_KEY` bloqueaba el firewall de producción).
 *
 * Uniforma las tres cosas que repetían todas las actions: exigir sesión
 * (requireAdminUser — el proxy NO es la única barrera), parsear el cuerpo
 * JSON y devolver el ActionResult tal cual. Los errores de negocio salen con
 * 200 y `{ ok:false, error }` — como el valor de retorno de la action que
 * sustituyen; solo la falta de sesión o un cuerpo ilegible son estado HTTP.
 */
export function adminJsonRoute(
  handler: (body: JsonBody, user: AdminUser) => Promise<ActionResult | (ActionResult & Record<string, unknown>)>,
) {
  return async function POST(request: NextRequest) {
    let user: AdminUser;
    try {
      user = await requireAdminUser();
    } catch {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as JsonBody | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
    }

    return NextResponse.json(await handler(body, user));
  };
}

/** Lee una propiedad de texto del cuerpo JSON sin arrastrar `unknown` a cada
 * llamador — devuelve "" si no vino, que es lo que los esquemas ya rechazan. */
export function text(body: JsonBody, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}
