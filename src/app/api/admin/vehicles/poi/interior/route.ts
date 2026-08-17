import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { saveInteriorPoi } from "@/lib/admin/services/poi";

export const POST = adminJsonRoute((body, user) =>
  saveInteriorPoi(user, text(body, "vehicleId"), body),
);
