import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { moveCategory } from "@/lib/admin/services/categories";

export const POST = adminJsonRoute(async (body, user) => {
  const direction = body.direction;
  if (direction !== "up" && direction !== "down") {
    return { ok: false as const, error: "Dirección desconocida." };
  }
  return moveCategory(user, text(body, "categoryId"), direction);
});
