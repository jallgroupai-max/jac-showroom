// Contrato compartido cliente/servidor del panel. Solo tipos — este módulo no
// tiene runtime, así que lo importan por igual los Route Handlers y el cliente
// (src/lib/admin/api.ts) sin arrastrar Prisma al bundle del navegador.

/** Resultado uniforme de toda mutación del panel. Mismo shape que devolvían
 * las Server Actions, para que los componentes no cambien su lógica. */
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/** Archivo viajando dentro de un cuerpo JSON: contenido en base64 más los
 * metadatos que el servidor necesita para validarlo (plan A7 — hotfix WAF:
 * ningún multipart, ningún nombre de campo con "$"). */
export type JsonFile = {
  name: string;
  type: string;
  /** Contenido en base64, SIN el prefijo `data:<mime>;base64,`. */
  data: string;
};
