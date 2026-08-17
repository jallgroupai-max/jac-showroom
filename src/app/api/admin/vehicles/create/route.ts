import { adminJsonRoute } from "@/lib/admin/json-route";
import { createVehicle } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body, user) => createVehicle(user, body.vehicle));
