// Orden del wizard según plan §0.2 — la ficha técnica va SEGUNDA, antes de
// tocar cualquier asset. Los pasos 3-6 llegan en fases posteriores; se listan
// desde ya (con su fase) para que la estructura no cambie bajo los pies.

export type WizardStep = {
  num: number;
  slug: string;
  title: string;
  /** Fase del plan en la que se habilita; null = disponible ya. */
  pendingPhase: string | null;
};

export const WIZARD_STEPS: WizardStep[] = [
  { num: 1, slug: "datos", title: "Datos y categoría", pendingPhase: null },
  { num: 2, slug: "ficha", title: "Ficha técnica", pendingPhase: null },
  { num: 3, slug: "galeria", title: "Galería 360° por color", pendingPhase: null },
  { num: 4, slug: "destacados", title: "Destacados", pendingPhase: null },
  { num: 5, slug: "interior", title: "Interior y puntos de interés", pendingPhase: null },
  { num: 6, slug: "escenarios", title: "Escenarios de fondo", pendingPhase: null },
];

/** Métricas por paso para la nav y la barra de completitud — calculadas
 * contra los requisitos REALES de publicación, no "la sección tiene algo". */
export type WizardCounts = {
  specGroups: number;
  colorsReady: number;
  colorsTotal: number;
  poisExterior: number;
  hasInterior: boolean;
  scenarios: number;
};

export function stepMeta(step: WizardStep, counts: WizardCounts | null): string {
  if (counts === null) return step.pendingPhase ? `Fase ${step.pendingPhase}` : "";
  switch (step.num) {
    case 1:
      return "Nombres, categoría, características";
    case 2:
      return counts.specGroups > 0 ? `${counts.specGroups} grupos` : "Sin especificaciones";
    case 3:
      return counts.colorsTotal > 0
        ? `${counts.colorsReady}/${counts.colorsTotal} colores listos`
        : "Sin colores";
    case 4:
      return counts.poisExterior > 0 ? `${counts.poisExterior} destacados` : "Sin destacados";
    case 5:
      return counts.hasInterior ? "Panorámica cargada" : "Sin panorámica";
    case 6:
      return counts.scenarios > 0 ? `${counts.scenarios} escenarios` : "Sin escenarios";
    default:
      return "";
  }
}

export function completedSections(counts: WizardCounts): number {
  return [
    true, // datos: si el registro existe, el paso 1 se completó
    counts.specGroups > 0,
    counts.colorsTotal > 0 && counts.colorsReady === counts.colorsTotal,
    counts.poisExterior > 0,
    counts.hasInterior,
    counts.scenarios > 0,
  ].filter(Boolean).length;
}
