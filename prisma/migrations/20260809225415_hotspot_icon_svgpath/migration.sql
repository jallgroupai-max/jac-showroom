/*
  Warnings:

  - You are about to drop the column `svgUrl` on the `HotspotIcon` table. All the data in the column will be lost.
  - Added the required column `svgPath` to the `HotspotIcon` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "HotspotIcon" DROP COLUMN "svgUrl",
ADD COLUMN     "svgPath" TEXT NOT NULL;
