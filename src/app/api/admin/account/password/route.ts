import { adminJsonRoute } from "@/lib/admin/json-route";
import { changeOwnPassword } from "@/lib/admin/services/account";

export const POST = adminJsonRoute((body, user) =>
  changeOwnPassword(user, { current: body.current, next: body.next }),
);
