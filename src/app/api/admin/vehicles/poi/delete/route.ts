import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { deletePoi } from "@/lib/admin/services/poi";

export const POST = adminJsonRoute((body, user) =>
  deletePoi(user, text(body, "vehicleId"), text(body, "poiId")),
);
