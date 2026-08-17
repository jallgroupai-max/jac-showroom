import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

// Cierre de sesión. `redirect: false` para que Auth.js solo limpie la cookie
// y responda JSON — la navegación a /admin/login la hace el cliente (plan A7
// — hotfix WAF: ninguna Server Action, ningún campo con "$").
export async function POST() {
  await signOut({ redirect: false });
  return NextResponse.json({ ok: true });
}
