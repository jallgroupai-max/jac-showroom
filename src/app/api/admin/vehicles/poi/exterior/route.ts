import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { saveExteriorPoi } from "@/lib/admin/services/poi";

export const POST = adminJsonRoute((body, user) =>
  saveExteriorPoi(user, text(body, "vehicleId"), body),
);
