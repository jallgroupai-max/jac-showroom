// Slug desde modelo + versión (plan §1.9) — minúsculas, sin acentos, guiones.
export function slugify(...parts: string[]): string {
  return parts
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
