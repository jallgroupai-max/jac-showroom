import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { deleteLead } from "@/lib/admin/services/leads";

export const POST = adminJsonRoute((body, user) => deleteLead(user, text(body, "leadId")));
