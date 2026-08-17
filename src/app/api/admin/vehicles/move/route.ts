import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { moveVehicle } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute(async (body, user) => {
  const direction = body.direction;
  if (direction !== "up" && direction !== "down") {
    return { ok: false as const, error: "Dirección desconocida." };
  }
  return moveVehicle(user, text(body, "vehicleId"), direction);
});
