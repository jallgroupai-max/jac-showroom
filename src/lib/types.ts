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
  /** Alternativa a `sprites`: panorámica 360° equirectangular del interior
   * (2:1 EXACTO), mostrada con Photo Sphere Viewer (interior-panorama.tsx).
   * Con sprites e imageUrl vacíos, el vehículo NO tiene vista interior y el
   * toggle Exterior/Interior queda deshabilitado. */
  imageUrl?: string;
  /** Variante mobile de la panorámica (≤4096px de ancho — límite de textura
   * de las GPU móviles). Si falta, se usa `imageUrl` también en mobile. */
  imageUrlMobile?: string;
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
  /** Frame del set 360° (1..36) al que rota el vehículo al abrir este punto
   * de interés — solo aplica en exterior (en interior no hay sprite que
   * rotar). Ángulos aproximados/placeholder: no hay todavía una convención
   * documentada de qué frame corresponde a qué ángulo real. */
  frame?: number;
  /** Nombre de imagen grande (sin extensión) en /assets/poi para el panel de
   * detalle que aparece junto al vehículo. Sin esto, el panel muestra solo
   * título y descripción. */
  image?: string;
  /** Ritmo del anillo del marker de interior — configurable desde el panel
   * de administración. Ausente = "soft" (el comportamiento de siempre). */
  blink?: "soft" | "fast" | "none";
  /** Posición del ícono flotante SOBRE la panorámica 360 del interior —
   * coordenadas en píxeles de la textura equirectangular original (no del
   * viewport). Solo aplica en interior; en exterior el punto de interés se
   * ubica en la toolbar, no sobre la imagen. Valores aproximados: se
   * estimaron mirando la panorámica de referencia (elite-desktop.webp) —
   * ajustar si no coinciden con el elemento real. */
  panoramaPosition?: { textureX: number; textureY: number };
}

/** Posición/tamaño en viewport (px) de un ícono de punto de interés en el
 * momento del clic — usado para anclar PoiDetailPanel justo sobre el marker
 * en la panorámica de interior (su posición en pantalla cambia al arrastrar,
 * así que se captura al clickear, no se sigue en vivo). */
export interface MarkerAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
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
