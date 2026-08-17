import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { removeVehicleCardImage } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body, user) =>
  removeVehicleCardImage(user, text(body, "vehicleId")),
);
