import { ShowroomApp } from "@/components/showroom/showroom-app";
import { DEFAULT_VEHICLE_SLUG } from "@/lib/mock-data";

export default function Home() {
  return <ShowroomApp initialVehicleSlug={DEFAULT_VEHICLE_SLUG} />;
}
