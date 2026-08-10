import { PgBoss } from "pg-boss";

// Cliente pg-boss del lado Next — SOLO encola (boss.send); el consumo vive en
// worker/index.mjs, proceso aparte. Singleton por la misma razón que prisma.
const globalForBoss = globalThis as unknown as { bossReady?: Promise<PgBoss> };

export const QUEUE_COLOR_ZIP = "color-zip";

export function getBoss(): Promise<PgBoss> {
  if (!globalForBoss.bossReady) {
    const boss = new PgBoss({ connectionString: process.env.DATABASE_URL as string });
    boss.on("error", (error: Error) => console.error("[pg-boss]", error.message));
    globalForBoss.bossReady = boss.start().then(async () => {
      await boss.createQueue(QUEUE_COLOR_ZIP);
      return boss;
    });
  }
  return globalForBoss.bossReady;
}
