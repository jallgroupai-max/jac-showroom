import { adminJsonRoute } from "@/lib/admin/json-route";
import { updateCategory } from "@/lib/admin/services/categories";

export const POST = adminJsonRoute((body, user) =>
  updateCategory(user, {
    categoryId: body.categoryId,
    name: body.name,
    slug: body.slug,
    file: body.file,
    removeIcon: body.removeIcon,
  }),
);
