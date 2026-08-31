// Dibujo de un ícono del catálogo, en el MISMO orden de prioridad que usa el
// showroom público (iconRef en lib/data/catalog.ts):
//   1. iconUrl   — SVG subido desde /admin/iconos;
//   2. assetName — archivo real de /assets/icons (los del diseño original);
//   3. svgPath   — path 24×24 abstracto de respaldo.
// Que iconUrl gane es lo que permite reemplazar el dibujo de un ícono del
// seed sin tocar los archivos del repo.
export function HotspotIconImage({
  icon,
  size = 28,
}: {
  icon: { label: string; svgPath: string; assetName?: string | null; iconUrl?: string | null };
  size?: number;
}) {
  const src = icon.iconUrl ?? (icon.assetName ? `/assets/icons/${icon.assetName}.svg` : null);
  if (!src) return <CatalogIcon d={icon.svgPath} size={size * 0.75} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="h-full w-full object-contain"
    />
  );
}

// Renderiza un ícono del catálogo HotspotIcon (path 24×24, stroke — mismo
// formato que el prototipo).
export function CatalogIcon({
  d,
  size = 22,
  strokeWidth = 1.5,
}: {
  d: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

// Ícono de una categoría: el SVG que subió el admin si lo hay, y si no la
// silueta estática por slug — así las cuatro categorías del seed (que nunca
// subieron nada) siguen viéndose exactamente igual que antes.
export function CategoryIcon({
  category,
  size = 34,
  strokeWidth = 1.4,
  inverted = false,
}: {
  category: { slug: string; iconUrl?: string | null };
  size?: number;
  strokeWidth?: number;
  /** Sobre fondo oscuro (tarjeta de categoría activa). La silueta estática
   * usa currentColor y se adapta sola; el SVG subido no, así que se invierte
   * — un ícono negro sobre la tarjeta negra sería invisible. */
  inverted?: boolean;
}) {
  if (category.iconUrl) {
    return (
      /* SVG de tamaño fijo servido por /uploads: next/image no aporta nada
         sobre un vector. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={category.iconUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={inverted ? "object-contain invert" : "object-contain"}
      />
    );
  }
  return (
    <CatalogIcon
      d={CATEGORY_ICON_PATHS[category.slug] ?? FALLBACK_CATEGORY_PATH}
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}

// Siluetas por categoría para el selector de tipo (typeDefs del prototipo).
export const CATEGORY_ICON_PATHS: Record<string, string> = {
  pickups: "M2 16h20M4 16v-4h5l2-3h3v7M14 12h5l1 4",
  sedan: "M2 16h20M5 16c0-4 3-6.5 7-6.5s7 2.5 7 6.5M8.5 10l1-3h5l1.5 3",
  suv: "M2 16h20M5 16V9.5h14V16M8.5 9.5V6.5h7v3",
  comercial: "M2 16h20M4 16V7h11l5 5v4M15 7v5h5",
};

export const FALLBACK_CATEGORY_PATH =
  "M2 16h20M5 16c0-4 3-6.5 7-6.5s7 2.5 7 6.5M8.5 10l1-3h5l1.5 3";
