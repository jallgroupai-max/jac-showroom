import { prisma } from "@/lib/prisma";
import type { WizardCounts } from "./steps";

// Datos compartidos por los formularios del wizard.

export async function getWizardFormData() {
  const [categories, icons] = await Promise.all([
    prisma.category.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { vehicles: { where: { status: { not: "ARCHIVED" } } } } } },
    }),
    prisma.hotspotIcon.findMany({ orderBy: [{ group: "asc" }, { order: "asc" }] }),
  ]);

  return {
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      vehicleCount: c._count.vehicles,
    })),
    icons: icons.map((i) => ({
      id: i.id,
      key: i.key,
      label: i.label,
      group: i.group as string,
      svgPath: i.svgPath,
      assetName: i.assetName,
    })),
  };
}

export async function getVehicleWithCounts(vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      featureIcons: { orderBy: { order: "asc" } },
      specGroups: {
        orderBy: { order: "asc" },
        include: { items: { orderBy: { order: "asc" } } },
      },
      colors: {
        orderBy: { order: "asc" },
        include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
      pointsOfInterest: { orderBy: [{ mode: "asc" }, { order: "asc" }], include: { icon: true } },
      scenarios: { where: { enabled: true } },
    },
  });
  if (!vehicle) return null;

  const counts: WizardCounts = {
    specGroups: vehicle.specGroups.length,
    colorsReady: vehicle.colors.filter((c) => c.spriteBasePath !== null).length,
    colorsTotal: vehicle.colors.length,
    poisExterior: vehicle.pointsOfInterest.filter((p) => p.mode === "EXTERIOR").length,
    hasInterior: vehicle.interiorPanoramaUrl !== null,
    scenarios: vehicle.scenarios.length,
  };

  return { vehicle, counts };
}
