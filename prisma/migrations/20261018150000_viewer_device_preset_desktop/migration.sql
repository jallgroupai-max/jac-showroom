-- Presets de escritorio (innerWidth ≥ 1024) para el encuadre del 360°.
-- Solo amplía el enum: sin backfill (sin fila = default desktop del código:
-- offsetX 0, offsetY 0.10, scale 1.0) y los CHECK de VehicleViewerPosition
-- ya admiten esos valores, así que no se tocan.
-- Idempotente: se aplica a mano en Railway y puede re-ejecutarse sin daño.
-- Postgres ≥ 12 permite ADD VALUE dentro de una transacción (Prisma ejecuta
-- cada migración en una); el valor nuevo NO puede usarse en la misma
-- transacción, por eso aquí no hay ningún INSERT/UPDATE que lo referencie.

-- AlterEnum
ALTER TYPE "ViewerDevicePreset" ADD VALUE IF NOT EXISTS 'DESKTOP_LAPTOP';
ALTER TYPE "ViewerDevicePreset" ADD VALUE IF NOT EXISTS 'DESKTOP_FHD';
ALTER TYPE "ViewerDevicePreset" ADD VALUE IF NOT EXISTS 'DESKTOP_QHD';
