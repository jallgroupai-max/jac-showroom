import { adminJsonRoute } from "@/lib/admin/json-route";
import { createHotspotIcon } from "@/lib/admin/services/hotspot-icons";

export const POST = adminJsonRoute((body, user) =>
  createHotspotIcon(user, {
    label: body.label,
    group: body.group,
    source: body.source,
    assetName: body.assetName,
    file: body.file,
  }),
);
