import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { saveVehicleSpecs } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body, user) =>
  saveVehicleSpecs(user, text(body, "vehicleId"), body.specs),
);
