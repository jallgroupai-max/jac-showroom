import { ShowroomApp } from "@/components/showroom/showroom-app";

// Deep linking por slug de vehículo — docs/APP-FLOW.md §3.1 (resuelto): el
// slug determina QUÉ se precarga/activa, pero el usuario siempre pasa por
// la misma primera vista (no salta directo al visualizador).
export default async function VehicleDeepLinkPage({
  params,
}: {
  params: Promise<{ vehicleSlug: string }>;
}) {
  const { vehicleSlug } = await params;
  return <ShowroomApp initialVehicleSlug={vehicleSlug} />;
}
