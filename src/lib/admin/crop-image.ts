// Recorte de imagen en canvas — recibe el rect en píxeles que entrega
// react-easy-crop (onCropComplete) y devuelve el Blob recortado, listo para
// FormData. Todo corre en el cliente; el servidor solo redimensiona/comprime
// lo ya recortado (poi-actions.ts: processPoiImage).

export type PixelCrop = { x: number; y: number; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error("No se pudo leer la imagen.")));
    img.src = src;
  });
}

export async function getCroppedImageBlob(imageSrc: string, pixelCrop: PixelCrop): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(pixelCrop.width);
  canvas.height = Math.round(pixelCrop.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el recorte.");
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar el recorte."))),
      "image/webp",
      0.92,
    );
  });
}
