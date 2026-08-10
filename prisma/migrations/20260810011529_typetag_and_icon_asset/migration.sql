-- AlterTable
ALTER TABLE "HotspotIcon" ADD COLUMN     "assetName" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "typeTag" TEXT NOT NULL DEFAULT '';
