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

  const invalid = NextResponse.json(
    // Texto deliberadamente genérico: no revelar si el correo existe.
    { error: "Correo o contraseña incorrectos." },
    { status: 401 },
  );

  try {
    const outcome = await signIn("credentials", {
      email,
      password,
      redirectTo: safeRedirect,
      redirect: false,
    });

    // `signIn` con `redirect:false` NO lanza cuando las credenciales fallan:
    // devuelve la URL de la página de error (…/admin/login?error=Credentials
    // Signin) y deja la petición sin cookie de sesión. Sin comprobarlo, el
    // login respondía 200 a un intento fallido, el cliente navegaba a /admin
    // y el proxy lo devolvía al login — la pantalla que no avanzaba nunca.
    if (typeof outcome === "string" && new URL(outcome, request.url).searchParams.has("error")) {
      return invalid;
    }

    return NextResponse.json({ redirectTo: safeRedirect });
  } catch (error) {
    // Camino alterno: según la versión, Auth.js sí lanza en algunos fallos.
    if (error instanceof AuthError) return invalid;
    throw error;
  }
}
