import { NextResponse, type NextRequest } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

// Login como Route Handler con body JSON en vez de Server Action (plan A7 —
// hotfix WAF): el binding nativo `<form action={serverAction}>` hace que
// React serialice la llamada como multipart/form-data con campos
// `$ACTION_REF`/`$ACTION_KEY`; el WAF delante de producción (Citrix
// NetScaler AppFirewall) bloquea esos nombres de parámetro con `$` como
// posible inyección NoSQL. Un POST JSON normal no dispara esa firma.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const { email, password, redirectTo } = body as Record<string, unknown>;

  // Misma validación que la action original: solo rutas internas del panel,
  // para no convertir el login en un open redirect.
  const safeRedirect =
    typeof redirectTo === "string" && redirectTo.startsWith("/admin") ? redirectTo : "/admin";

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: safeRedirect,
      redirect: false,
    });
    return NextResponse.json({ redirectTo: safeRedirect });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
    }
    throw error;
  }
}
