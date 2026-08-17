import { adminJsonRoute } from "@/lib/admin/json-route";
import { createScenario } from "@/lib/admin/services/scenarios";

export const POST = adminJsonRoute((body, user) =>
  createScenario(user, {
    label: body.label,
    kind: body.kind,
    color: body.color,
    file: body.file,
  }),
);
