import { createHmac, timingSafeEqual } from "node:crypto";

// Token firmado de previsualización (plan §1.8): un draft NUNCA es visible en
// público — ni por URL directa. El botón Previsualizar del panel abre
// /{slug}?preview=<token>, firmado con AUTH_SECRET y de vida corta.

const TTL_SECONDS = 30 * 60;

function sign(payload: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "")
    .update(payload)
    .digest("base64url");
}

export function createPreviewToken(vehicleId: string): string {
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${vehicleId}.${expires}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

/** Devuelve el vehicleId si el token es válido y no expiró; null si no. */
export function verifyPreviewToken(token: string | undefined): string | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const payload = Buffer.from(encoded, "base64url").toString();
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [vehicleId, expiresRaw] = payload.split(".");
  if (!vehicleId || Number(expiresRaw) < Math.floor(Date.now() / 1000)) return null;
  return vehicleId;
}
