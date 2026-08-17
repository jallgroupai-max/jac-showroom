import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { removeOwnBackground } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body, user) =>
  removeOwnBackground(user, text(body, "vehicleId")),
);
