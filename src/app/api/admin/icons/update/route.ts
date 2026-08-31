import { adminJsonRoute } from "@/lib/admin/json-route";
import { updateHotspotIcon } from "@/lib/admin/services/hotspot-icons";

export const POST = adminJsonRoute((body, user) =>
  updateHotspotIcon(user, {
    iconId: body.iconId,
    label: body.label,
    group: body.group,
    file: body.file,
    removeIcon: body.removeIcon,
  }),
);
