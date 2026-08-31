import { adminJsonRoute } from "@/lib/admin/json-route";
import { createCategory } from "@/lib/admin/services/categories";

export const POST = adminJsonRoute((body, user) =>
  createCategory(user, { name: body.name, slug: body.slug, file: body.file }),
);
