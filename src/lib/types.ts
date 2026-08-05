// Modelo de datos del showroom — ver docs/TRD.md §5.
// Esta forma es la misma que tendrá el CMS real (Sanity/Strapi); por ahora
// se sirve desde src/lib/mock-data.ts (ver docs/IMPLEMENTATION-PLAN.md §5,
// "funcional primero, integrar después").

export type ViewMode = "exterior" | "interior";

export type Quality = "low" | "medium" | "high";

export const QUALITIES: Quality[] = ["low", "medium", "high"];

/** Set de 36 frames para una calidad determinada. */
export interface SpriteSet {
  quality: Quality;
  /** Devuelve la URL del frame N (1-based, 1..36). */
  frameUrl: (frame: number) => string;
}

export interface Category {
  slug: string;
  name: string;
  order: number;
}

export interface VehicleVariant {
  id: string;
  colorName: string;
  colorHex: string;
  /** Sprites exterior, uno por calidad. */
  exteriorSprites: SpriteSet[];
  /** Thumbnail usado en el carrusel de colores. */
  thumbnailUrl: string;
}

export interface InteriorSprites {
  /** Sprites interior, uno por calidad. No tiene variantes de color. */
  sprites: SpriteSet[];
}

export interface SpecItem {
  label: string;
  value: string;
}

export interface SpecGroup {
  title: string;
  items: SpecItem[];
}

export interface PointOfInterest {
  id: string;
  mode: ViewMode;
  icon: string; // nombre de ícono en recursos/Iconos (o placeholder)
  title: string;
  description: string;
  order: number;
}

export interface Scene {
  id: string;
  label: string;
  /** Ausente para "own" y para escenas de color sólido. */
  imageUrl?: string;
  /** Color sólido de fondo (alternativa a `imageUrl`) — paleta neutra
   * pensada para no chocar con ningún color de vehículo y hacer juego con
   * la UI (blancos/grises/negro que ya usan header y controles). */
  color?: string;
}

export interface Dealer {
  id: string;
  city: string;
  active: boolean;
}

export interface Vehicle {
  slug: string;
  commercialName: string; // ej. "Aventura 4X4"
  technicalName: string; // ej. "Frison T9 4X4"
  trimLabel: string; // ej. "Gasolina Automática"
  categorySlug: string;
  typeTag: string; // ej. "Pickup · 221 hp"
  order: number;
  featureIcons: string[]; // íconos rápidos que se ven en la card del catálogo
  /** Foto propia para la card del catálogo — si falta, se usa el thumbnail
   * de la primera variante. */
  cardImageUrl?: string;
  ownBackgroundUrl: string; // background "propio" del vehículo (escena "own")
  variants: VehicleVariant[];
  interior: InteriorSprites;
  specGroups: SpecGroup[];
  warrantyLabel: string;
  pointsOfInterest: PointOfInterest[];
}

export type ContactChannel = "whatsapp" | "call" | "email";

export interface LeadPayload {
  fullName: string;
  phone: string;
  email: string;
  dealerId: string;
  contactChannel: ContactChannel;
  wantsTestDrive: boolean;
  vehicleSlug: string;
  vehicleCommercialName: string;
  vehicleTechnicalName: string;
  variantColorName: string;
  origin: "mobile" | "desktop";
}
