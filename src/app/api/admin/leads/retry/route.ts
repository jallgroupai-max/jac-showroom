import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { retryLeadSync } from "@/lib/admin/services/leads";

export const POST = adminJsonRoute((body, user) => retryLeadSync(user, text(body, "leadId")));
