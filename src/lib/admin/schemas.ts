import { z } from "zod";
import { VIEWER_LIMITS, VIEWER_PRESETS } from "@/lib/viewer-position";

// Esquemas compartidos cliente (react-hook-form) / servidor (server actions).
// La validación del servidor es la que manda — la del cliente solo acorta el
// ciclo de feedback (plan A7: nunca confiar en el cliente).

export const vehicleBasicsSchema = z.object({
  commercialName: z.string().trim().min(1, "El nombre comercial es obligatorio").max(80),
  technicalName: z.string().trim().min(1, "El nombre técnico es obligatorio").max(80),
  trimLabel: z.string().trim().min(1, "La versión es obligatoria").max(80),
  slug: z
    .string()
    .trim()
    .min(1, "El slug es obligatorio")
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones"),
  categoryId: z.string().min(1, "Elige una categoría"),
  // Texto de la card del catálogo — se autollena `${categoría} · ${versión}`
  // pero es editable: los datos validados pixel-a-pixel lo exigen (§1.9).
  typeTag: z.string().trim().min(1, "La etiqueta de la card es obligatoria").max(60),
  // Íconos de combustible/tracción (HotspotIcon group GENERAL) — los chips
  // que muestra el carrusel "selecciona tu vehículo" del showroom público.
  // Sin .default(): react-hook-form + zodResolver exigen que el tipo de
  // entrada y el de salida coincidan; los defaults los pone defaultValues.
  iconIds: z.array(z.string()),
});

export type VehicleBasicsInput = z.infer<typeof vehicleBasicsSchema>;

export const specItemSchema = z.object({
  label: z.string().trim().min(1, "La etiqueta es obligatoria").max(60),
  value: z.string().trim().min(1, "El valor es obligatorio").max(120),
});

export const vehicleSpecsSchema = z.object({
  warrantyLabel: z.string().trim().max(120),
  title: z.string().trim().min(1, "El título es obligatorio").max(60),
  // Lista libre de fila título+valor — el admin puede seguir agregando
  // filas con "+" (ej. Potencia, Torque, Cilindrada...).
  items: z.array(specItemSchema).min(1, "Agrega al menos una fila a la ficha técnica"),
});

export type SpecItemInput = z.infer<typeof specItemSchema>;
export type VehicleSpecsInput = z.infer<typeof vehicleSpecsSchema>;

// Paso "Posición del vehículo": encuadre del 360° exterior por preset de pantalla.
// Mismos rangos que los CHECK de VehicleViewerPosition (z.number() ya rechaza
// NaN e Infinity). Valores ABSOLUTOS, no deltas sobre el default.
const viewerRange = (limits: { min: number; max: number }, what: string) =>
  z
    .number({ error: `${what} debe ser un número.` })
    .min(limits.min, `${what} debe estar entre ${limits.min} y ${limits.max}.`)
    .max(limits.max, `${what} debe estar entre ${limits.min} y ${limits.max}.`);

export const viewerPositionSchema = z.object({
  offsetX: viewerRange(VIEWER_LIMITS.offsetX, "La posición horizontal"),
  offsetY: viewerRange(VIEWER_LIMITS.offsetY, "La posición vertical"),
  scale: viewerRange(VIEWER_LIMITS.scale, "El tamaño"),
});

// Por preset: objeto = guardar (upsert); null = restablecer a default (borra
// la fila); ausente = no tocar.
export const vehicleViewerPositionsSchema = z.partialRecord(
  z.enum(VIEWER_PRESETS),
  viewerPositionSchema.nullable(),
);

export type VehicleViewerPositionsInput = z.infer<typeof vehicleViewerPositionsSchema>;
