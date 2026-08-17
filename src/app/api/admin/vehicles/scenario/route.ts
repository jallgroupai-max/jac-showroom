import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { toggleVehicleScenario } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body, user) =>
  toggleVehicleScenario(
    user,
    text(body, "vehicleId"),
    text(body, "scenarioId"),
    body.enabled === true,
  ),
);
