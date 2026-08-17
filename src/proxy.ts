import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Corte de acceso al panel (plan §2.1). Convención Next 16: proxy.ts (el
// middleware.ts clásico está deprecado). Solo decodifica el JWT de la cookie —
// la verificación contra la DB vive en requireAdminUser() (src/lib/auth.ts),
// que llaman el layout del panel y cada handler de /api/admin: la doc de Next
// es explícita en que el proxy no debe ser la única barrera.

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // El prefijo __Secure- de la cookie depende del PROTOCOLO real (Auth.js lo
  // decide así al emitirla), no de NODE_ENV: un build de producción servido
  // por http (localhost, red interna) emite la cookie sin prefijo. Detrás de
  // un proxy TLS, nextUrl ya refleja x-forwarded-proto.
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: request.nextUrl.protocol === "https:",
  });

  // /api/admin/login es la única API pública del panel — es el propio
  // Route Handler de login (POST JSON, ver login-form.tsx), no tiene sesión
  // todavía por definición.
  if (pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  // API protegida: sin sesión → 401 JSON, nunca redirect (es un fetch).
  if (pathname.startsWith("/api/admin")) {
    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // /admin/login es la única página pública del panel; con sesión activa
  // redirige adentro para no mostrar el login a quien ya entró.
  if (pathname === "/admin/login") {
    if (token) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return withNoindex(NextResponse.next());
  }

  if (!token) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  return withNoindex(NextResponse.next());
}

// El panel jamás se indexa (plan §2.1) ni se embebe en un iframe (plan A7 —
// el showroom público SÍ podrá embeberse a futuro, TRD §7; el panel nunca).
function withNoindex(response: NextResponse) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
