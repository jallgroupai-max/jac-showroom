// Prisma 7: la conexión para el CLI (migrate/studio/seed) se configura aquí,
// no en schema.prisma. El CLI ya NO carga .env solo — dotenv lo hace.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "prisma/migrations",
    seed: "node --env-file=.env prisma/seed.mjs",
  },
});
