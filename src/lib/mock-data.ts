import type { Category, PointOfInterest, Quality, Scene, SpecGroup, SpriteSet, Vehicle } from "./types";

// Fuente de datos MOCK — misma forma que tendrá el CMS real (Sanity/Strapi).
// Ver docs/TRD.md §5 y docs/IMPLEMENTATION-PLAN.md §5 ("funcional primero, integrar después").

/**
 * Convención de assets 360°: public/assets/models/{modelo}/{color}/{quality}
 * con frames 0001..0036.webp. Un vehículo SIN `model` no tiene set 360° —
 * el visualizador muestra la silueta compartida (/assets/shadow.png) con el
 * aviso "Vehículo no disponible".
 */
const MODELS_BASE = "/assets/models";

/** Imagen de silueta compartida para vehículos sin modelo 360°. */
export const UNAVAILABLE_VEHICLE_IMAGE = "/assets/shadow.png";

/** Carpeta de sprites por color de carrocería con set 360° disponible. */
const COLOR_SPRITE_SLUGS: Record<string, string> = {
  Rojo: "rojo",
  Blanco: "blanco",
  Negro: "negro",
  Azul: "azul",
};

function modelSpriteSets(model: string, colorName: string): SpriteSet[] {
  const slug = COLOR_SPRITE_SLUGS[colorName] ?? "rojo";
  const qualities: Quality[] = ["low", "medium", "high"];
  return qualities.map((quality) => ({
    quality,
    frameUrl: (frame: number) =>
      `${MODELS_BASE}/${model}/${slug}/${quality}/${String(frame).padStart(4, "0")}.webp`,
  }));
}

// Thumbnail del selector de color: el frame 25 del set LOW del propio color
// (vista 3/4 del vehículo ya pintado) — así la muestra siempre coincide con
// el color real del sprite, sin assets aparte que mantener.
const THUMBNAIL_FRAME = 25;

function colorThumbnailUrl(model: string, colorName: string): string {
  return modelSpriteSets(model, colorName)[0].frameUrl(THUMBNAIL_FRAME);
}

// Los 4 colores de carrocería con set 360° real (COLOR_SPRITE_SLUGS) — todo
// vehículo ofrece exactamente estos, variando solo cuál es el default.
const BODY_COLORS = {
  Blanco: "#F2F3F5",
  Negro: "#1B1C1F",
  Azul: "#2E5FA3",
  Rojo: "#C22B2B",
} as const;

type BodyColorName = keyof typeof BODY_COLORS;

function bodyColors(first: BodyColorName): Array<{ name: string; hex: string }> {
  const names = Object.keys(BODY_COLORS) as BodyColorName[];
  return [first, ...names.filter((n) => n !== first)].map((name) => ({
    name,
    hex: BODY_COLORS[name],
  }));
}

export const HAS_REAL_SPRITES = false;

export const CATEGORIES: Category[] = [
  { slug: "pickups", name: "Pickups", order: 0 },
  { slug: "sedan", name: "Sedán", order: 1 },
  { slug: "suv", name: "SUV", order: 2 },
  { slug: "comercial", name: "Comercial", order: 3 },
];

export const SCENES: Scene[] = [
  { id: "light", label: "Claro", imageUrl: "/assets/backgrounds/light.jpeg" },
  // { id: "own", label: "Propio" }, // usa Vehicle.ownBackgroundUrl
  { id: "dark", label: "Oscuro", imageUrl: "/assets/backgrounds/dark.jpeg" },
];

const AVENTURA_4X4_SPECS: SpecGroup[] = [
  {
    title: "ESPECIFICACIONES",
    items: [
      { label: "Potencia", value: "221 hp" },
      { label: "Torque", value: "280 lb-ft" },
      { label: "Motor", value: "2.0L Turbo GDI · 4 cilindros" },
      { label: "Transmisión", value: "Automática de 8 velocidades" },
      { label: "Tren motriz", value: "4×4 · 2H / 4H / 4L" },
      { label: "Carga útil", value: "1,000 kg" },
      { label: "Remolque", value: "750 – 3,500 kg" },
      { label: "Frenos", value: "ABS · EBD · BOS" },
    ],
  },
];

const GENERIC_POI_EXTERIOR: PointOfInterest[] = [
  { id: "poi-ext-1", mode: "exterior", icon: "engine", title: "Motor", description: "Información general del motor (contenido placeholder).", order: 0 },
  { id: "poi-ext-2", mode: "exterior", icon: "tire", title: "Llantas", description: "Información general de llantas y suspensión (contenido placeholder).", order: 1 },
  { id: "poi-ext-3", mode: "exterior", icon: "front-lghts", title: "Luces delanteras", description: "Información general de iluminación (contenido placeholder).", order: 2 },
  { id: "poi-ext-4", mode: "exterior", icon: "automatic", title: "Transmisión", description: "Información general de transmisión (contenido placeholder).", order: 3 },
];

const GENERIC_POI_INTERIOR: PointOfInterest[] = [
  { id: "poi-int-1", mode: "interior", icon: "touch-screen", title: "Pantalla táctil", description: "Información general del sistema multimedia (contenido placeholder).", order: 0 },
  { id: "poi-int-2", mode: "interior", icon: "smart-steering-wheel", title: "Volante inteligente", description: "Información general de controles (contenido placeholder).", order: 1 },
  { id: "poi-int-3", mode: "interior", icon: "seat-heater", title: "Asientos", description: "Información general de confort (contenido placeholder).", order: 2 },
  { id: "poi-int-4", mode: "interior", icon: "connectivity", title: "Conectividad", description: "Información general de conectividad (contenido placeholder).", order: 3 },
];

function makeVehicle(partial: {
  slug: string;
  commercialName: string;
  technicalName: string;
  trimLabel: string;
  typeTag: string;
  categorySlug: string;
  order: number;
  featureIcons: string[];
  /** Primer color = variante activa por defecto. */
  colors: Array<{ name: string; hex: string }>;
  /** Carpeta del modelo 360° en /assets/models (ej. "elite"). Sin modelo,
   * el vehículo NO está disponible en el visualizador: silueta + aviso. */
  model?: string;
  /** Imagen propia para la tarjeta del catálogo. */
  cardImageUrl?: string;
  specGroups?: SpecGroup[];
}): Vehicle {
  return {
    slug: partial.slug,
    commercialName: partial.commercialName,
    technicalName: partial.technicalName,
    trimLabel: partial.trimLabel,
    categorySlug: partial.categorySlug,
    typeTag: partial.typeTag,
    order: partial.order,
    featureIcons: partial.featureIcons,
    cardImageUrl: partial.cardImageUrl,
    ownBackgroundUrl: "/assets/backgrounds/light.jpeg",
    // Con `model`, cada variante carga el set 360° de SU color desde
    // /assets/models/{modelo}/{color}/{quality} y su thumbnail sale del
    // propio set (frame 25 en low). Sin modelo, una única variante SIN
    // sprites (exteriorSprites vacío) — el visualizador lo detecta y
    // muestra la silueta con "Vehículo no disponible".
    variants: partial.model
      ? partial.colors.map(({ name, hex }) => ({
          id: `${partial.slug}-${name.toLowerCase()}`,
          colorName: name,
          colorHex: hex,
          exteriorSprites: modelSpriteSets(partial.model!, name),
          thumbnailUrl: colorThumbnailUrl(partial.model!, name),
        }))
      : [
          {
            id: `${partial.slug}-${partial.colors[0].name.toLowerCase()}`,
            colorName: partial.colors[0].name,
            colorHex: partial.colors[0].hex,
            exteriorSprites: [],
            thumbnailUrl: partial.cardImageUrl ?? UNAVAILABLE_VEHICLE_IMAGE,
          },
        ],
    interior: { sprites: partial.model ? modelSpriteSets(partial.model, "Rojo") : [] },
    specGroups: partial.specGroups ?? [{ title: "ESPECIFICACIONES", items: [] }],
    warrantyLabel: "Garantía de 5 años / 100,000 km",
    pointsOfInterest: [...GENERIC_POI_EXTERIOR, ...GENERIC_POI_INTERIOR],
  };
}

export const VEHICLES: Vehicle[] = [
  // ——— Sedán ———
  makeVehicle({
    slug: "elite",
    commercialName: "ÉLITE",
    technicalName: "ÉLITE",
    trimLabel: "Sedán",
    typeTag: "Sedán · Automático",
    categorySlug: "sedan",
    order: 0,
    // Tipos de vehículo (electrico/gasolina/gasoil/4x4, combinables) — se
    // muestran como círculos en la card del catálogo.
    featureIcons: ["gasoil-car"],
    colors: bodyColors("Blanco"),
    // ÉLITE es el único con modelo 360° completo: los 4 sets de color
    // (blanco/negro/azul/rojo) viven en /assets/models/elite. Su card del
    // catálogo usa la foto real; las muestras de color salen del sprite.
    model: "elite",
    cardImageUrl: "/assets/vehicles/elite.png",
    specGroups: AVENTURA_4X4_SPECS,
  }),
  makeVehicle({
    slug: "gx7",
    commercialName: "GX7",
    technicalName: "GX7",
    trimLabel: "Sedán",
    typeTag: "Sedán · Automático",
    categorySlug: "sedan",
    order: 1,
    featureIcons: ["gasoil-car"],
    colors: [{ name: "Rojo", hex: BODY_COLORS.Rojo }],
    cardImageUrl: "/assets/vehicles/gx7.png",
  }),
  makeVehicle({
    slug: "arena-jac-sport",
    commercialName: "Arena Jac Sport",
    technicalName: "Arena Jac Sport",
    trimLabel: "AT",
    typeTag: "Sedán · AT",
    categorySlug: "sedan",
    order: 2,
    featureIcons: ["gasoil-car"],
    colors: [{ name: "Negro", hex: BODY_COLORS.Negro }],
    cardImageUrl: "/assets/vehicles/arena-jac-sport.png",
  }),
  // ——— Pickups ———
  makeVehicle({
    slug: "la-venezolana-pro",
    commercialName: "La Venezolana Pro",
    technicalName: "La Venezolana Pro",
    trimLabel: "4×4",
    typeTag: "Pickup · 4×4",
    categorySlug: "pickups",
    order: 0,
    // Combinación de tipos: 4x4 + diésel.
    featureIcons: ["4x4-car", "diesel-car"],
    colors: [{ name: "Azul", hex: BODY_COLORS.Azul }],
    cardImageUrl: "/assets/vehicles/la-venezolana-pro.png",
  }),
  // ——— Comercial ———
  makeVehicle({
    slug: "sunray-v6-carga",
    commercialName: "SUNRAY V6 CARGA",
    technicalName: "SUNRAY V6 CARGA",
    trimLabel: "Carga",
    typeTag: "Comercial · Carga",
    categorySlug: "comercial",
    order: 0,
    featureIcons: ["diesel-car"],
    colors: [{ name: "Blanco", hex: BODY_COLORS.Blanco }],
    cardImageUrl: "/assets/vehicles/sunray-v6-carga.png",
  }),
];

export const DEFAULT_VEHICLE_SLUG = "elite";

export const DEALERS = [{ id: "barquisimeto", city: "Barquisimeto", active: true }];

export function getVehicleBySlug(slug: string): Vehicle | undefined {
  return VEHICLES.find((v) => v.slug === slug);
}

/** Un vehículo sin modelo 360° (sin sets de sprites) NO está disponible:
 * se previsualiza como silueta pero no se puede entrar a su detalle. */
export function isVehicleAvailable(vehicle: Vehicle): boolean {
  return vehicle.variants[0].exteriorSprites.length > 0;
}

export function getVehiclesByCategory(categorySlug: string): Vehicle[] {
  return VEHICLES.filter((v) => v.categorySlug === categorySlug).sort((a, b) => a.order - b.order);
}
