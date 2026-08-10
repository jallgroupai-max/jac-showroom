"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

// Server action del login. signIn lanza en AMBOS caminos: NEXT_REDIRECT en
// éxito (hay que relanzarlo para que Next navegue) y AuthError en fallo — el
// único caso que se traduce a mensaje. Texto deliberadamente genérico: no
// revelar si el correo existe.
export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  // redirectTo viene de un hidden input; solo se aceptan rutas internas del
  // panel para no convertir el login en un open redirect.
  const redirectTo = formData.get("redirectTo");
  if (typeof redirectTo !== "string" || !redirectTo.startsWith("/admin")) {
    formData.set("redirectTo", "/admin");
  }

  try {
    await signIn("credentials", formData);
    return undefined;
  } catch (error) {
    if (error instanceof AuthError) {
      return "Correo o contraseña incorrectos.";
    }
    throw error;
  }
}
