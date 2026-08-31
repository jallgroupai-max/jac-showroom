-- Ícono subido desde /admin/iconos. Nullable: los íconos del seed siguen
-- resolviéndose por assetName, así que no hace falta backfill.
ALTER TABLE "HotspotIcon" ADD COLUMN "iconUrl" TEXT;

-- Los íconos creados desde el panel traen su SVG completo, no un path 24×24.
ALTER TABLE "HotspotIcon" ALTER COLUMN "svgPath" SET DEFAULT '';
