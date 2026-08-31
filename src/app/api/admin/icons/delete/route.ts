import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { deleteHotspotIcon } from "@/lib/admin/services/hotspot-icons";

export const POST = adminJsonRoute((body, user) =>
  deleteHotspotIcon(user, text(body, "iconId")),
);
