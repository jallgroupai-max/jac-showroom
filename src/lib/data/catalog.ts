import "server-only";
import { prisma } from "@/lib/prisma";
import type { PointOfInterest, Scene, SpecGroup } from "@/lib/types";
import type { CatalogDTO, VehicleDTO } from "@/lib/catalog-dto";
import { UNAVAILABLE_VEHICLE_IMAGE } from "@/lib/mock-data";

// Adapter Prisma → CatalogDTO (Fase A5) — la fila "CMS" de la Fase 4 del
// plan público, hecha realidad: el showroom deja de leer mock-data.ts.
// Solo PUBLISHED sale al público; un draft entra ÚNICAMENTE vía el token de
// previsualización del panel (previewVehicleId).

// Escenas globales fijas claro/oscuro (TRD §4.5) — assets estáticos, mismo
// contenido que el mock. Los escenarios administrables van aparte.
const GLOBAL_SCENES: Scene[] = [
  { id: "light", label: "Claro", imageUrl: "/assets/backgrounds/light.jpeg" },
  { id: "dark", label: "Oscuro", imageUrl: "/assets/backgrounds/dark.jpeg" },
];

const FALLBACK_OWN_BACKGROUND = "/assets/backgrounds/light.jpeg";

export async function getCatalogDTO(options?: { previewVehicleId?: string | null }): Promise<CatalogDTO> {
  const previewVehicleId = options?.previewVehicleId ?? null;

  const [categories, vehicles, scenarios, dealers] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.vehicle.findMany({
      where: previewVehicleId
        ? { OR: [{ status: "PUBLISHED" }, { id: previewVehicleId }] }
        : { status: "PUBLISHED" },
      orderBy: { order: "asc" },
      include: {
        category: true,
        colors: { orderBy: { order: "asc" } },
        featureIcons: { orderBy: { order: "asc" }, include: { hotspotIcon: true } },
        specGroups: { orderBy: { order: "asc" }, include: { items: { orderBy: { order: "asc" } } } },
        pointsOfInterest: { orderBy: { order: "asc" }, include: { icon: true } },
        scenarios: { where: { enabled: true } },
      },
    }),
    prisma.scenario.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.dealer.findMany({ where: { active: true } }),
  ]);

  return {
    categories: categories.map((c) => ({ slug: c.slug, name: c.name, order: c.order })),
    scenes: GLOBAL_SCENES,
    customScenes: scenarios.map((s) => ({
      id: s.id,
      label: s.label,
      imageUrl: s.imageUrl ?? undefined,
      color: s.color ?? undefined,
    })),
    vehicles: vehicles.map(toVehicleDTO),
    defaultSlug: vehicles[0]?.slug ?? "",
    dealers: dealers.map((d) => ({ id: d.id, city: d.city, active: d.active })),
  };
}

type VehicleRow = Awaited<ReturnType<typeof loadOne>>;
// Solo para tipar la fila con includes — nunca se llama.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function loadOne() {
  return prisma.vehicle.findFirstOrThrow({
    include: {
      category: true,
      colors: true,
      featureIcons: { include: { hotspotIcon: true } },
      specGroups: { include: { items: true } },
      pointsOfInterest: { include: { icon: true } },
      scenarios: { where: { enabled: true } },
    },
  });
}

function toVehicleDTO(v: VehicleRow): VehicleDTO {
  const readyColors = v.colors.filter((c) => c.spriteBasePath !== null);

  const variants =
    readyColors.length > 0
      ? readyColors.map((c) => ({
          id: c.id,
          colorName: c.colorName,
          colorHex: c.colorHex,
          spriteBase: c.spriteBasePath,
          thumbnailUrl:
            c.profileImageUrl ?? `${c.spriteBasePath}/low/0025.webp`,
        }))
      : [
          // Sin galería procesada (solo alcanzable vía preview de un draft):
          // una variante sin sprites — el visor muestra la silueta y el aviso
          // "Vehículo no disponible", mismo mecanismo que el mock.
          {
            id: `${v.slug}-sin-galeria`,
            colorName: v.colors[0]?.colorName ?? "—",
            colorHex: v.colors[0]?.colorHex ?? "#CCCCCC",
            spriteBase: null,
            thumbnailUrl: v.cardImageUrl ?? UNAVAILABLE_VEHICLE_IMAGE,
          },
        ];

  const specGroups: SpecGroup[] = v.specGroups.map((g) => ({
    title: g.title,
    items: g.items.map((i) => ({ label: i.label, value: i.value })),
  }));

  const panoramaWidth = v.interiorPanoramaWidth ?? 0;
  const panoramaHeight = v.interiorPanoramaHeight ?? 0;

  const pointsOfInterest: PointOfInterest[] = v.pointsOfInterest.map((p) => ({
    id: p.id,
    mode: p.mode === "EXTERIOR" ? "exterior" : "interior",
    icon: iconRef(p.icon.assetName, p.icon.svgPath),
    title: p.title,
    description: p.description,
    order: p.order,
    frame: p.frame ?? undefined,
    image: p.imageUrl ?? undefined,
    imageMobile: p.imageMobileUrl ?? undefined,
    iconSize: p.iconSize,
    blink: p.blink === "SOFT" ? "soft" : p.blink === "FAST" ? "fast" : "none",
    // 0–1 almacenado (§1.5) → píxeles de textura, que es lo que espera el
    // visor (interior-panorama.tsx / Photo Sphere Viewer).
    panoramaPosition:
      p.textureX !== null && p.textureY !== null && panoramaWidth > 0
        ? {
            textureX: Math.round(p.textureX * panoramaWidth),
            textureY: Math.round(p.textureY * panoramaHeight),
          }
        : undefined,
  }));

  return {
    slug: v.slug,
    commercialName: v.commercialName,
    technicalName: v.technicalName,
    trimLabel: v.trimLabel,
    categorySlug: v.category.slug,
    // Almacenado (§1.9); si quedó vacío (registros pre-migración), deriva.
    typeTag: v.typeTag || `${v.category.name} · ${v.trimLabel}`,
    order: v.order,
    featureIcons: v.featureIcons.map((f) =>
      iconRef(f.hotspotIcon.assetName, f.hotspotIcon.svgPath),
    ),
    cardImageUrl: v.cardImageUrl ?? undefined,
    ownBackgroundUrl: v.ownBackgroundUrl ?? FALLBACK_OWN_BACKGROUND,
    variants,
    interiorImageUrl: v.interiorPanoramaUrl ?? undefined,
    interiorImageUrlMobile: v.interiorPanoramaMobileUrl ?? undefined,
    specGroups,
    warrantyLabel: v.warrantyLabel,
    pointsOfInterest,
    scenarioIds: v.scenarios.map((s) => s.scenarioId),
  };
}

/** Referencia de ícono para el público: el SVG REAL de /assets/icons cuando
 * existe (fidelidad pixel — son los archivos de recursos/Iconos), o un
 * data-URI dibujado desde el path del catálogo como respaldo. iconAssetUrl
 * (mock-data) pasa ambos formatos tal cual. */
function iconRef(assetName: string | null, svgPath: string): string {
  if (assetName) return assetName;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#111318" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${svgPath}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
