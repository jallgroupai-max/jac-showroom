import sharp from "sharp";

// Derivados de la panorámica de interior (plan §1.4): original capada a 8192
// px + variante mobile (≤4096px, límite de textura de GPU móvil). Compartido
// por la subida del wizard (/vehicles/[id]/interior-panorama) y la importación
// de paquetes — un solo lugar para calidad y tamaños.
const MOBILE_MAX_WIDTH = 4096;
const DESKTOP_MAX_WIDTH = 8192;

/** `width` = ancho original (ya validado 2:1). */
export async function deriveInteriorPanorama(buffer: Buffer, width: number) {
  const desktopWidth = Math.min(width, DESKTOP_MAX_WIDTH);
  const desktop = await sharp(buffer).resize({ width: desktopWidth }).webp({ quality: 80 }).toBuffer();
  const mobile = await sharp(buffer)
    .resize({ width: Math.min(width, MOBILE_MAX_WIDTH) })
    .webp({ quality: 78 })
    .toBuffer();
  return { desktop, mobile, desktopWidth, desktopHeight: desktopWidth / 2 };
}
