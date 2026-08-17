import type { JsonFile } from "./api-types";

// Lado servidor del transporte de archivos en JSON (ver api-types.ts). El
// cliente manda { name, type, data:base64 }; aquí se vuelve Buffer.

export type DecodedFile = { buffer: Buffer; type: string; name: string };

/**
 * Convierte una entrada JSON de archivo en Buffer. Devuelve null cuando NO hay
 * archivo — incluye el caso de un <input type="file"> vacío, que antes llegaba
 * como File de 0 bytes: los llamadores distinguen "no mandó archivo" de
 * "mandó uno inválido" igual que antes.
 */
export function decodeJsonFile(value: unknown): DecodedFile | null {
  if (!value || typeof value !== "object") return null;
  const file = value as Partial<JsonFile>;
  if (typeof file.data !== "string" || file.data.length === 0) return null;

  const buffer = Buffer.from(file.data, "base64");
  if (buffer.length === 0) return null;

  return {
    buffer,
    type: typeof file.type === "string" ? file.type : "",
    name: typeof file.name === "string" ? file.name : "archivo",
  };
}
