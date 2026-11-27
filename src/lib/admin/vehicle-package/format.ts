import { z } from "zod";

// Formato del paquete "jac-vehicle" (.zip) que exporta/importa el panel.
// Módulo PURO (solo zod, sin imports del proyecto): lo cargan tanto el
// exportador/importador como scripts/check-vehicle-package.mjs, que corre en
// Node plano sin resolver el alias "@/". Por eso los literales de abajo
// espejan los de src/lib/viewer-position.ts — el check verifica que no diverjan.
//
// Árbol del zip (rutas relativas, siempre con "/"):
//   vehicle.json                      manifiesto (este esquema)
//   colors/<colorSlug>/001..036.webp  36 fotogramas 360° por color (calidad
//                                     "high" — la mejor que queda en storage)
//   interior/panorama.webp            panorámica equirectangular 2:1
//   card/image.webp                   foto de la card del catálogo
//   background/own.webp               fondo propio
//   poi/exterior-01.webp, exterior-01-mobile.webp, interior-01.webp ...
// Las rutas del manifiesto son la ÚNICA forma de que el importador lea un
// archivo del zip: lo que no esté referenciado se ignora.

export const PACKAGE_FORMAT = "jac-vehicle";
export const PACKAGE_VERSION = 1;
export const MANIFEST_NAME = "vehicle.json";
export const FRAME_COUNT = 36;

// Límites anti zip-bomb / input hostil (el zip es input no confiable).
export const IMPORT_LIMITS = {
  /** Entradas máximas en el directorio central. */
  maxEntries: 2000,
  /** Tamaño descomprimido total máximo (suma de lo DECLARADO por el zip). */
  maxTotalBytes: 3 * 1024 ** 3,
  /** vehicle.json. */
  maxManifestBytes: 2 * 1024 ** 2,
  /** Un fotograma. */
  maxFrameBytes: 80 * 1024 ** 2,
  /** Cualquier otra imagen (card, fondo, POI). */
  maxImageBytes: 40 * 1024 ** 2,
  /** Panorámica interior. */
  maxPanoramaBytes: 120 * 1024 ** 2,
} as const;

const IMAGE_PATH = /\.(webp|png|jpe?g)$/i;

/**
 * Normaliza la ruta de una entrada del zip y devuelve null si NO es segura:
 * absoluta, con letra de unidad, con segmento "..", vacía o con NUL.
 * El importador nunca escribe a disco con estas rutas (solo las usa como
 * clave de búsqueda), pero igual se rechazan: un zip con ".." es un ataque,
 * no un paquete nuestro.
 */
export function safeEntryPath(raw: string): string | null {
  if (!raw || raw.includes("\0")) return null;
  const p = raw.replaceAll("\\", "/");
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
  const segments = p.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.length === 0 || segments.includes("..")) return null;
  return segments.join("/");
}

const zipPath = z
  .string()
  .max(200)
  .refine((p) => safeEntryPath(p) === p, "Ruta de archivo no válida dentro del paquete");
const imagePath = zipPath.refine((p) => IMAGE_PATH.test(p), "Solo se admiten imágenes .webp, .png o .jpg");

const slug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones");

// Mismos presets/rangos que VIEWER_PRESETS / VIEWER_LIMITS (viewer-position.ts).
const VIEWER_PRESET_VALUES = [
  "PHONE_SMALL",
  "PHONE_STANDARD",
  "PHONE_TALL",
  "TABLET",
  "DESKTOP_LAPTOP",
  "DESKTOP_FHD",
  "DESKTOP_QHD",
] as const;
export const VIEWER_RANGES = {
  offsetX: { min: -0.5, max: 0.5 },
  offsetY: { min: -0.25, max: 0.5 },
  scale: { min: 0.5, max: 2.5 },
} as const;
const ranged = (r: { min: number; max: number }) => z.number().min(r.min).max(r.max);

const colorSchema = z.object({
  slug,
  name: z.string().trim().min(1).max(60),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido (#RRGGBB)"),
  order: z.number().int().min(0),
  frameCount: z.number().int().min(1).max(FRAME_COUNT),
  /** Índice i = fotograma i+1. null = el color aún no tenía galería procesada. */
  frames: z.array(imagePath).length(FRAME_COUNT).nullable(),
});

const poiSchema = z.object({
  mode: z.enum(["EXTERIOR", "INTERIOR"]),
  /** key de HotspotIcon — NUNCA el id de la base. */
  icon: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400),
  order: z.number().int().min(0),
  iconSize: z.number().int().min(50).max(200),
  blink: z.enum(["SOFT", "FAST", "NONE"]),
  /** EXTERIOR: fotograma 1–36 al que gira el vehículo. */
  frame: z.number().int().min(1).max(FRAME_COUNT).nullable(),
  /** INTERIOR: posición normalizada 0–1 sobre la panorámica. */
  textureX: z.number().min(0).max(1).nullable(),
  textureY: z.number().min(0).max(1).nullable(),
  image: imagePath.nullable(),
  imageMobile: imagePath.nullable(),
});

export const manifestSchema = z
  .object({
    format: z.literal(PACKAGE_FORMAT),
    version: z.literal(PACKAGE_VERSION),
    exportedAt: z.string().optional(),
    /** Avisos del exportador (p. ej. un archivo que ya no estaba en storage). */
    warnings: z.array(z.string()).optional(),
    vehicle: z.object({
      commercialName: z.string().trim().min(1).max(80),
      technicalName: z.string().trim().min(1).max(80),
      trimLabel: z.string().trim().min(1).max(80),
      slug,
      typeTag: z.string().trim().max(60),
      warrantyLabel: z.string().trim().max(120),
      /** slug de Category. */
      category: slug,
      /** key de HotspotIcon, en orden. */
      featureIcons: z.array(z.string().min(1).max(80)).max(50),
    }),
    specGroups: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(60),
          items: z
            .array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(120) }))
            .max(200),
        }),
      )
      .max(50),
    colors: z.array(colorSchema).max(40),
    pointsOfInterest: z.array(poiSchema).max(200),
    interiorPanorama: imagePath.nullable(),
    images: z.object({ card: imagePath.nullable(), ownBackground: imagePath.nullable() }),
    viewerPositions: z
      .array(
        z.object({
          preset: z.enum(VIEWER_PRESET_VALUES),
          offsetX: ranged(VIEWER_RANGES.offsetX),
          offsetY: ranged(VIEWER_RANGES.offsetY),
          scale: ranged(VIEWER_RANGES.scale),
        }),
      )
      .max(VIEWER_PRESET_VALUES.length),
    /** Por label (el catálogo es global y sus ids cambian entre entornos). */
    scenarios: z.array(z.object({ label: z.string().trim().min(1).max(80), enabled: z.boolean() })).max(200),
  })
  .superRefine((m, ctx) => {
    const dupes = (values: string[]) => values.filter((v, i) => values.indexOf(v) !== i);
    const colorDupes = dupes(m.colors.map((c) => c.slug));
    if (colorDupes.length) ctx.addIssue({ code: "custom", message: `Colores repetidos: ${colorDupes.join(", ")}` });
    const presetDupes = dupes(m.viewerPositions.map((p) => p.preset));
    if (presetDupes.length) ctx.addIssue({ code: "custom", message: `Posiciones repetidas: ${presetDupes.join(", ")}` });
    for (const poi of m.pointsOfInterest) {
      if (poi.mode === "INTERIOR" && (poi.textureX === null || poi.textureY === null)) {
        ctx.addIssue({ code: "custom", message: `El punto interior "${poi.title}" no tiene posición` });
      }
    }
  });

export type Manifest = z.infer<typeof manifestSchema>;

/** Todas las rutas de archivo que referencia el manifiesto (sin repetidos). */
export function referencedPaths(m: Manifest): string[] {
  const paths = new Set<string>();
  for (const c of m.colors) for (const f of c.frames ?? []) paths.add(f);
  for (const p of m.pointsOfInterest) {
    if (p.image) paths.add(p.image);
    if (p.imageMobile) paths.add(p.imageMobile);
  }
  for (const p of [m.interiorPanorama, m.images.card, m.images.ownBackground]) if (p) paths.add(p);
  return [...paths];
}

export type ZipEntryInfo = { path: string; type: string; size: number };

/**
 * Valida el directorio central del zip ANTES de leer ningún contenido y lo
 * indexa por ruta normalizada. Lanza Error (mensaje accionable) si hay
 * demasiadas entradas, tamaño descomprimido total excesivo, rutas inseguras o
 * duplicadas. Ignora directorios, __MACOSX y archivos ocultos de sistema.
 */
export function indexZipEntries<T extends ZipEntryInfo>(entries: T[], limits = IMPORT_LIMITS): Map<string, T> {
  if (entries.length > limits.maxEntries) {
    throw new Error(`El zip tiene demasiadas entradas (${entries.length}; máximo ${limits.maxEntries}).`);
  }
  let total = 0;
  const index = new Map<string, T>();
  for (const entry of entries) {
    if (entry.type !== "File") continue;
    const safe = safeEntryPath(entry.path);
    if (!safe) throw new Error(`El zip contiene una ruta no permitida: "${entry.path.slice(0, 80)}".`);
    if (safe.startsWith("__MACOSX/") || safe.split("/").some((s) => s.startsWith("."))) continue;
    if (index.has(safe)) throw new Error(`El zip repite la entrada "${safe}".`);
    total += entry.size;
    if (total > limits.maxTotalBytes) {
      throw new Error(
        `El zip descomprimido pesaría más de ${Math.round(limits.maxTotalBytes / 1024 ** 3)} GB — se rechaza.`,
      );
    }
    index.set(safe, entry);
  }
  return index;
}
