import { notFound } from "next/navigation";
import { ShowroomApp } from "@/components/showroom/showroom-app";
import { getCatalogDTO } from "@/lib/data/catalog";
import { mockCatalogDTO } from "@/lib/catalog-dto";
import { verifyPreviewToken } from "@/lib/preview-token";

// Deep linking por slug — docs/APP-FLOW.md §3.1: el slug determina QUÉ se
// precarga/activa, pero el usuario siempre pasa por la misma primera vista.
//
// Un vehículo NO publicado responde 404 incluso por URL directa (plan §1.8);
// la única excepción es el token firmado de previsualización del panel.
export const dynamic = "force-dynamic";

export default async function VehicleDeepLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleSlug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const [{ vehicleSlug }, { preview }] = await Promise.all([params, searchParams]);

  const previewVehicleId = verifyPreviewToken(preview);
  const catalog = await getCatalogDTO({ previewVehicleId });
  const effective = catalog.vehicles.length > 0 ? catalog : mockCatalogDTO();

  if (!effective.vehicles.some((v) => v.slug === vehicleSlug)) notFound();

  return <ShowroomApp initialVehicleSlug={vehicleSlug} catalog={effective} />;
}
