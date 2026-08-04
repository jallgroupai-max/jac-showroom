import type { Category, PointOfInterest, Quality, Scene, SpecGroup, SpriteSet, Vehicle } from "./types";

// Fuente de datos MOCK — misma forma que tendrá el CMS real (Sanity/Strapi).
// Ver docs/TRD.md §5 y docs/IMPLEMENTATION-PLAN.md §5 ("funcional primero, integrar después").

/**
 * ⚠️ PLACEHOLDER DE ASSETS: todavía no existe un set de fotos 360° por
 * modelo/color — solo tenemos UN prototipo real (recursos/QUALITYS, un sedán
 * rojo) recibido como piloto técnico del pipeline. Mientras no lleguen los
 * sets reales por vehículo (Fase 4 del plan de implementación), los 5
 * vehículos del catálogo comparten este mismo set de sprites como demo
 * funcional del mecanismo de rotación/calidad — el visualizador muestra un
 * aviso visible de "vista previa técnica" cuando esto aplica.
 */
const DEMO_SPRITE_BASE = "/assets/demo-vehicle/exterior";

function demoSpriteSets(): SpriteSet[] {
  const qualities: Quality[] = ["low", "medium", "high"];
  return qualities.map((quality) => ({
    quality,
    frameUrl: (frame: number) =>
      `${DEMO_SPRITE_BASE}/${quality}/${String(frame).padStart(4, "0")}.webp`,
  }));
}

// Thumbnails reales del selector de color — recursos/controlers-colores-car/
// (Opcion-1..5.png), copiadas a public/assets/colors/. A diferencia del
// sprite 360° (que sigue siendo placeholder compartido), estas imágenes SÍ
// son los assets reales entregados para esta pieza específica de UI.
const COLOR_THUMBNAILS: Record<string, string> = {
  Rojo: "/assets/colors/rojo.png",
  Azul: "/assets/colors/azul.png",
  Blanco: "/assets/colors/blanco.png",
  Negro: "/assets/colors/negro.png",
  Gris: "/assets/colors/gris.png",
};

export const HAS_REAL_SPRITES = false;

export const CATEGORIES: Category[] = [
  { slug: "pickups", name: "Pickups", order: 0 },
  { slug: "sedan", name: "Sedán", order: 1 },
  { slug: "suv", name: "SUV", order: 2 },
  { slug: "comercial", name: "Comercial", order: 3 },
];

export const SCENES: Scene[] = [
  { id: "light", label: "Claro", imageUrl: "/assets/backgrounds/light.png" },
  // { id: "own", label: "Propio" }, // usa Vehicle.ownBackgroundUrl
  { id: "dark", label: "Oscuro", imageUrl: "/assets/backgrounds/dark.jpg" },
  // Fondos de color sólido — grises claros, un crema suave y dos oscuros
  // pensados a propósito para la composición/simetría del vehículo, sin
  // chocar con NINGÚN color de carrocería (incluidos vehículos blancos,
  // negros o rojos, no solo el rojo de prueba): ninguno usa blanco puro ni
  // negro puro, así siempre queda un borde de contraste con el silueta.
  { id: "color-perla", label: "Perla", color: "#F4F6F9" },
  { id: "color-gris-claro", label: "Gris claro", color: "#DADFE6" },
  { id: "color-crema", label: "Crema", color: "#EFE7DA" },
  { id: "color-grafito", label: "Grafito", color: "#33363E" },
  { id: "color-carbon", label: "Carbón", color: "#17181C" },
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
  order: number;
  featureIcons: string[];
  /** Primer color = variante activa por defecto. */
  colors: Array<{ name: string; hex: string }>;
  specGroups?: SpecGroup[];
}): Vehicle {
  return {
    slug: partial.slug,
    commercialName: partial.commercialName,
    technicalName: partial.technicalName,
    trimLabel: partial.trimLabel,
    categorySlug: "pickups",
    typeTag: partial.typeTag,
    order: partial.order,
    featureIcons: partial.featureIcons,
    ownBackgroundUrl: "/assets/backgrounds/light.png",
    // ⚠️ El sprite 360° sigue siendo el placeholder compartido (ver nota de
    // arriba) — pero el thumbnail del selector de color SÍ usa el asset
    // real entregado (recursos/controlers-colores-car).
    variants: partial.colors.map(({ name, hex }) => ({
      id: `${partial.slug}-${name.toLowerCase()}`,
      colorName: name,
      colorHex: hex,
      exteriorSprites: demoSpriteSets(),
      thumbnailUrl: COLOR_THUMBNAILS[name] ?? demoSpriteSets()[1].frameUrl(1),
    })),
    interior: { sprites: demoSpriteSets() },
    specGroups: partial.specGroups ?? [{ title: "ESPECIFICACIONES", items: [] }],
    warrantyLabel: "Garantía de 5 años / 100,000 km",
    pointsOfInterest: [...GENERIC_POI_EXTERIOR, ...GENERIC_POI_INTERIOR],
  };
}

export const VEHICLES: Vehicle[] = [
  makeVehicle({
    slug: "venezolana-pro",
    commercialName: "Venezolana Pro",
    technicalName: "Venezolana Pro",
    trimLabel: "4×2",
    typeTag: "Pickup · 4×2",
    order: 0,
    featureIcons: ["engine"],
    colors: [
      { name: "Azul", hex: "#2E5FA3" },
      { name: "Rojo", hex: "#C22B2B" },
      { name: "Gris", hex: "#6B7280" },
    ],
  }),
  makeVehicle({
    slug: "aventura-pro",
    commercialName: "Aventura Pro",
    technicalName: "Aventura Pro",
    trimLabel: "Eléctrico",
    typeTag: "Pickup · Eléctrico",
    order: 1,
    featureIcons: ["connectivity"],
    colors: [
      { name: "Rojo", hex: "#C22B2B" },
      { name: "Azul", hex: "#2E5FA3" },
      { name: "Negro", hex: "#1B1C1F" },
    ],
  }),
  makeVehicle({
    slug: "aventura-4x4",
    commercialName: "Aventura 4X4",
    technicalName: "Frison T9 4X4",
    trimLabel: "Gasolina Automática",
    typeTag: "Pickup · 221 hp",
    order: 2,
    featureIcons: ["suspension", "engine"],
    colors: [
      { name: "Blanco", hex: "#F2F3F5" },
      { name: "Rojo", hex: "#C22B2B" },
      { name: "Azul", hex: "#2E6FB8" },
      { name: "Gris", hex: "#6B7280" },
      { name: "Negro", hex: "#1B1C1F" },
    ],
    specGroups: AVENTURA_4X4_SPECS,
  }),
  makeVehicle({
    slug: "la-venezolana",
    commercialName: "La Venezolana",
    technicalName: "La Venezolana",
    trimLabel: "4×4",
    typeTag: "Pickup · 4×4",
    order: 3,
    featureIcons: ["suspension", "engine"],
    colors: [
      { name: "Azul", hex: "#2E6FB8" },
      { name: "Blanco", hex: "#F2F3F5" },
      { name: "Negro", hex: "#1B1C1F" },
    ],
  }),
  makeVehicle({
    slug: "pickup-limited",
    commercialName: "Pickup Limited",
    technicalName: "Pickup Limited",
    trimLabel: "Diésel",
    typeTag: "Pickup · Diésel",
    order: 4,
    featureIcons: ["engine"],
    colors: [
      { name: "Negro", hex: "#1B1C1F" },
      { name: "Gris", hex: "#6B7280" },
    ],
  }),
];

export const DEFAULT_VEHICLE_SLUG = "aventura-4x4";

export const DEALERS = [{ id: "barquisimeto", city: "Barquisimeto", active: true }];

export function getVehicleBySlug(slug: string): Vehicle | undefined {
  return VEHICLES.find((v) => v.slug === slug);
}

export function getVehiclesByCategory(categorySlug: string): Vehicle[] {
  return VEHICLES.filter((v) => v.categorySlug === categorySlug).sort((a, b) => a.order - b.order);
}
