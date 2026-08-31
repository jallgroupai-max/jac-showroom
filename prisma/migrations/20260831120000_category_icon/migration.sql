-- Ícono propio por categoría (SVG subido desde /admin/categorias).
-- Nullable a propósito: las categorías existentes siguen cayendo a la
-- silueta estática por slug, así que la migración no necesita backfill.
ALTER TABLE "Category" ADD COLUMN "iconUrl" TEXT;
