import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { isStatusAction, setVehicleStatus } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute(async (body, user) => {
  if (!isStatusAction(body.action)) {
    return { ok: false as const, error: "Transición desconocida." };
  }
  return setVehicleStatus(user, text(body, "vehicleId"), body.action);
});
