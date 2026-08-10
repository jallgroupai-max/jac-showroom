import type {
  Category,
  PointOfInterest,
  Quality,
  Scene,
  SpecGroup,
  SpriteSet,
  Vehicle,
  VehicleVariant,
} from "./types";
import { QUALITIES } from "./types";
import * as mock from "./mock-data";

// Contrato serializable entre el servidor (Prisma) y el cliente (visor) —
// plan §1.6: SpriteSet.frameUrl es una FUNCIÓN y no puede cruzar la frontera
// Server → Client Component. El servidor arma este DTO; el cliente lo hidrata
// a los tipos que los componentes del showroom ya consumen, sin tocarlos.

export interface VariantDTO {
  id: string;
  colorName: string;
  colorHex: string;
  /** Base de sprites (…/{low|medium|high}/0001.webp). Null = sin galería:
   * el visor muestra la silueta de "no disponible" (mismo criterio mock). */
  spriteBase: string | null;
  thumbnailUrl: string;
}

export interface VehicleDTO {
  slug: string;
  commercialName: string;
  technicalName: string;
  trimLabel: string;
  categorySlug: string;
  typeTag: string;
  order: number;
  featureIcons: string[];
  cardImageUrl?: string;
  ownBackgroundUrl: string;
  variants: VariantDTO[];
  interiorImageUrl?: string;
  interiorImageUrlMobile?: string;
  specGroups: SpecGroup[];
  warrantyLabel: string;
  /** Ya serializable — panoramaPosition viene en píxeles de textura (el
   * adapter convierte los 0–1 almacenados usando las dimensiones guardadas). */
  pointsOfInterest: PointOfInterest[];
  /** Escenarios (del catálogo global) habilitados para ESTE vehículo. */
  scenarioIds: string[];
}

export interface CatalogDTO {
  categories: Category[];
  /** Escenas globales fijas (claro/oscuro) — assets estáticos, TRD §4.5. */
  scenes: Scene[];
  /** Catálogo global de escenarios administrables (modal del lápiz). */
  customScenes: Scene[];
  vehicles: VehicleDTO[];
  defaultSlug: string;
  dealers: Array<{ id: string; city: string; active: boolean }>;
}

const THUMBNAIL_FRAME = 25; // mismo criterio que mock-data: frame 3/4 en LOW

function frameUrlFor(base: string, quality: Quality): SpriteSet {
  return {
    quality,
    frameUrl: (frame: number) => `${base}/${quality}/${String(frame).padStart(4, "0")}.webp`,
  };
}

export function hydrateVehicle(dto: VehicleDTO): Vehicle {
  const variants: VehicleVariant[] = dto.variants.map((v) => ({
    id: v.id,
    colorName: v.colorName,
    colorHex: v.colorHex,
    exteriorSprites: v.spriteBase ? QUALITIES.map((q) => frameUrlFor(v.spriteBase as string, q)) : [],
    thumbnailUrl: v.thumbnailUrl,
  }));

  return {
    slug: dto.slug,
    commercialName: dto.commercialName,
    technicalName: dto.technicalName,
    trimLabel: dto.trimLabel,
    categorySlug: dto.categorySlug,
    typeTag: dto.typeTag,
    order: dto.order,
    featureIcons: dto.featureIcons,
    cardImageUrl: dto.cardImageUrl,
    ownBackgroundUrl: dto.ownBackgroundUrl,
    variants,
    interior: {
      sprites: [],
      imageUrl: dto.interiorImageUrl,
      imageUrlMobile: dto.interiorImageUrlMobile,
    },
    specGroups: dto.specGroups,
    warrantyLabel: dto.warrantyLabel,
    pointsOfInterest: dto.pointsOfInterest,
  };
}

export interface HydratedCatalog {
  categories: Category[];
  scenes: Scene[];
  customScenes: Scene[];
  vehicles: Vehicle[];
  defaultSlug: string;
  dealers: CatalogDTO["dealers"];
  /** Escenarios habilitados por vehículo (slug → ids del catálogo global). */
  scenarioIdsBySlug: Record<string, string[]>;
}

export function hydrateCatalog(dto: CatalogDTO): HydratedCatalog {
  return {
    categories: dto.categories,
    scenes: dto.scenes,
    customScenes: dto.customScenes,
    vehicles: dto.vehicles.map(hydrateVehicle),
    defaultSlug: dto.defaultSlug,
    dealers: dto.dealers,
    scenarioIdsBySlug: Object.fromEntries(dto.vehicles.map((v) => [v.slug, v.scenarioIds])),
  };
}

export { THUMBNAIL_FRAME };

// ————————————————————————————————————————————————————————————————
// Fixture: catálogo mock como DTO — es lo que sirve el showroom cuando la DB
// aún no tiene ningún vehículo publicado (dev sin seed). mock-data.ts se
// conserva exactamente para esto (plan A5).
// ————————————————————————————————————————————————————————————————

export function mockCatalogDTO(): CatalogDTO {
  return {
    categories: mock.CATEGORIES,
    scenes: mock.SCENES,
    customScenes: mock.CUSTOM_SCENES,
    defaultSlug: mock.DEFAULT_VEHICLE_SLUG,
    dealers: mock.DEALERS,
    vehicles: mock.VEHICLES.map((v) => ({
      slug: v.slug,
      commercialName: v.commercialName,
      technicalName: v.technicalName,
      trimLabel: v.trimLabel,
      categorySlug: v.categorySlug,
      typeTag: v.typeTag,
      order: v.order,
      featureIcons: v.featureIcons,
      cardImageUrl: v.cardImageUrl,
      ownBackgroundUrl: v.ownBackgroundUrl,
      variants: v.variants.map((variant) => ({
        id: variant.id,
        colorName: variant.colorName,
        colorHex: variant.colorHex,
        // La base se reconstruye desde el thumbnail (…/low/0025.webp) — los
        // sets mock siguen la misma convención {base}/{quality}/{frame}.webp.
        spriteBase:
          variant.exteriorSprites.length > 0
            ? variant.thumbnailUrl.replace(/\/low\/0025\.webp$/, "")
            : null,
        thumbnailUrl: variant.thumbnailUrl,
      })),
      interiorImageUrl: v.interior.imageUrl,
      interiorImageUrlMobile: v.interior.imageUrlMobile,
      specGroups: v.specGroups,
      warrantyLabel: v.warrantyLabel,
      pointsOfInterest: v.pointsOfInterest,
      // En el mock todos los fondos personalizados están disponibles para
      // todos los vehículos — mismo comportamiento que tenía la app.
      scenarioIds: mock.CUSTOM_SCENES.map((s) => s.id),
    })),
  };
}
