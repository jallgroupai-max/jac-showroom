-- Encuadre del 360° exterior en mobile, por vehículo y preset de pantalla.
-- Tabla nueva sin backfill: sin fila = encuadre por defecto del código
-- (bottom-[3%], scale-[1.25]), así que los vehículos existentes no cambian.
-- Idempotente: se aplica a mano en Railway y puede re-ejecutarse sin daño.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ViewerDevicePreset" AS ENUM ('PHONE_SMALL', 'PHONE_STANDARD', 'PHONE_TALL', 'TABLET');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
-- offsetX: fracción del ancho del héroe (0 = centrado, + = derecha).
-- offsetY: línea de piso, fracción del alto del héroe desde abajo (+ = sube).
-- scale:   multiplicador, origen abajo-centro.
-- BETWEEN también rechaza NaN e ±Infinity (en Postgres NaN > todo número).
CREATE TABLE IF NOT EXISTS "VehicleViewerPosition" (
    "vehicleId" TEXT NOT NULL,
    "preset" "ViewerDevicePreset" NOT NULL,
    "offsetX" DOUBLE PRECISION NOT NULL,
    "offsetY" DOUBLE PRECISION NOT NULL,
    "scale" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "VehicleViewerPosition_pkey" PRIMARY KEY ("vehicleId", "preset"),
    CONSTRAINT "VehicleViewerPosition_offsetX_check" CHECK ("offsetX" BETWEEN -0.5 AND 0.5),
    CONSTRAINT "VehicleViewerPosition_offsetY_check" CHECK ("offsetY" BETWEEN -0.25 AND 0.5),
    CONSTRAINT "VehicleViewerPosition_scale_check" CHECK ("scale" BETWEEN 0.5 AND 2.5)
);

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "VehicleViewerPosition" ADD CONSTRAINT "VehicleViewerPosition_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
