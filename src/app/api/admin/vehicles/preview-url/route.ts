import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { getPreviewUrl } from "@/lib/admin/services/vehicles";

export const POST = adminJsonRoute((body) => getPreviewUrl(text(body, "vehicleId")));
