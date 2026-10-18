import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { saveVehicleViewerPositions } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body, user) =>
  saveVehicleViewerPositions(user, text(body, "vehicleId"), body.positions),
);
