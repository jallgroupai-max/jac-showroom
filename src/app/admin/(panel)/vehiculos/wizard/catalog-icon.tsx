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

// Siluetas por categoría para el selector de tipo (typeDefs del prototipo).
export const CATEGORY_ICON_PATHS: Record<string, string> = {
  pickups: "M2 16h20M4 16v-4h5l2-3h3v7M14 12h5l1 4",
  sedan: "M2 16h20M5 16c0-4 3-6.5 7-6.5s7 2.5 7 6.5M8.5 10l1-3h5l1.5 3",
  suv: "M2 16h20M5 16V9.5h14V16M8.5 9.5V6.5h7v3",
  comercial: "M2 16h20M4 16V7h11l5 5v4M15 7v5h5",
};

export const FALLBACK_CATEGORY_PATH =
  "M2 16h20M5 16c0-4 3-6.5 7-6.5s7 2.5 7 6.5M8.5 10l1-3h5l1.5 3";
