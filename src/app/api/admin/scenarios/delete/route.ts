import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { deleteScenario } from "@/lib/admin/services/scenarios";

export const POST = adminJsonRoute((body, user) =>
  deleteScenario(user, text(body, "scenarioId"), body.force === true),
);
