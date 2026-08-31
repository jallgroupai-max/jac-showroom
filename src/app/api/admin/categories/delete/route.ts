import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { deleteCategory } from "@/lib/admin/services/categories";

export const POST = adminJsonRoute((body, user) =>
  deleteCategory(user, text(body, "categoryId")),
);
