import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { updateVehicleBasics } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body, user) =>
  updateVehicleBasics(user, text(body, "vehicleId"), body.vehicle),
);
