import { adminJsonRoute } from "@/lib/admin/json-route";
import { updateOwnProfile } from "@/lib/admin/services/account";

export const POST = adminJsonRoute((body, user) =>
  updateOwnProfile(user, { name: body.name, email: body.email }),
);
