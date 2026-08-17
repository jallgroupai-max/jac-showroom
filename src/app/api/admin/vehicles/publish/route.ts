import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { publishVehicle } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body, user) => publishVehicle(user, text(body, "vehicleId")));
