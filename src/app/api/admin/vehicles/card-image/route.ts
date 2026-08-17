import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { saveVehicleCardImage } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body, user) =>
  saveVehicleCardImage(user, text(body, "vehicleId"), body.file),
);
