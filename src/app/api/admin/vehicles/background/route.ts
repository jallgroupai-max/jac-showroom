import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { saveOwnBackground } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body, user) =>
  saveOwnBackground(user, text(body, "vehicleId"), body.file),
);
