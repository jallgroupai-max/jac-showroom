import { ShowroomApp } from "@/components/showroom/showroom-app";
import { getCatalogDTO } from "@/lib/data/catalog";
import { mockCatalogDTO } from "@/lib/catalog-dto";

// El catálogo se lee de la DB en el servidor y viaja como DTO serializable
// (plan §1.6). Sin ningún vehículo publicado todavía, sirve el fixture mock —
// así el showroom nunca queda en blanco en desarrollo.
export const dynamic = "force-dynamic";

export default async function Home() {
  const catalog = await getCatalogDTO();
  const effective = catalog.vehicles.length > 0 ? catalog : mockCatalogDTO();
  return <ShowroomApp initialVehicleSlug={effective.defaultSlug} catalog={effective} />;
}
