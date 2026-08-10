import { z } from "zod";

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
  // Sin .default(): react-hook-form + zodResolver exigen que el tipo de
  // entrada y el de salida coincidan; los defaults los pone defaultValues.
  iconIds: z.array(z.string()),
});

export type VehicleBasicsInput = z.infer<typeof vehicleBasicsSchema>;

export const vehicleSpecsSchema = z.object({
  warrantyLabel: z.string().trim().max(120),
  groups: z.array(
    z.object({
      title: z.string().trim().min(1, "El grupo necesita un título").max(60),
      items: z
        .array(
          z.object({
            label: z.string().trim().min(1, "Falta la etiqueta").max(80),
            value: z.string().trim().min(1, "Falta el valor").max(120),
          }),
        )
        .min(1, "El grupo necesita al menos una fila"),
    }),
  ),
});

export type VehicleSpecsInput = z.infer<typeof vehicleSpecsSchema>;
