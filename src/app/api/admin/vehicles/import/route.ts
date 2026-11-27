import { adminJsonRoute, text } from "@/lib/admin/json-route";
import { assembleParts, discardUpload, PartError } from "@/lib/admin/vehicle-package/chunked-upload";
import { importVehiclePackage } from "@/lib/admin/vehicle-package/import";

// Paso final de la importación: el cliente ya subió el .zip en partes
// (PUT /api/admin/uploads?uploadId=…&part=N). Aquí se concatenan en disco y se
// importa. Cuerpo JSON chico — por eso sí pasa por el proxy sin problema.
export const POST = adminJsonRoute(async (body, user) => {
  const uploadId = text(body, "uploadId");
  const parts = Number(body.parts);
  try {
    const zipPath = await assembleParts(uploadId, parts);
    return await importVehiclePackage(user, zipPath);
  } catch (error) {
    if (error instanceof PartError) return { ok: false, error: error.message };
    throw error;
  } finally {
    await discardUpload(uploadId);
  }
});
