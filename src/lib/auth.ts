import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Auth del panel de administración (plan §2.1): credenciales + JWT en cookie
// httpOnly. Permisos planos — no hay roles: estar autenticado ES el permiso.
// El proxy (src/proxy.ts) corta el paso sin sesión, pero la verificación de
// verdad vive en requireAdminUser(), llamada por el layout del panel y por
// cada Route Handler de /api/admin (defensa en profundidad — la propia doc de
// Next advierte no confiar solo en el proxy).

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        // Rate limit del login (plan A7): 10 intentos por IP cada 5 minutos —
        // frena fuerza bruta sin molestar a un humano que se equivoca.
        const ip = clientIp(request.headers);
        const { allowed } = rateLimit({ key: `login:${ip}`, limit: 10, windowSeconds: 300 });
        if (!allowed) return null;

        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.adminUser.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user) return null;

        const ok = await verify(user.passwordHash, parsed.data.password);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.userId === "string") session.user.id = token.userId;
      return session;
    },
  },
});

/**
 * Sesión válida Y usuario aún existente en la DB — una sesión JWT viva no
 * debe sobrevivir a un usuario dado de baja. Devuelve null si no hay acceso:
 * la forma para layouts/páginas, que redirigen con redirect().
 */
export async function getAdminUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return prisma.adminUser.findUnique({ where: { id: userId } });
}

/**
 * La misma guardia para Route Handlers de /api/admin: lanza si no hay acceso.
 * Usar SIEMPRE dentro de cada handler — el proxy no es la única barrera.
 */
export async function requireAdminUser() {
  const user = await getAdminUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
