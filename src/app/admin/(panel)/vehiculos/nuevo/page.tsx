import { WizardShell } from "../wizard/wizard-shell";
import { Step1Form } from "../wizard/step1-form";
import { getWizardFormData } from "../wizard/data";

// "Nuevo vehículo": paso 1 sin registro todavía — al enviar se crea el
// Vehicle en DRAFT y se continúa en /admin/vehiculos/[id]?paso=2 (§0.2).
export default async function NuevoVehiculoPage() {
  const { categories, icons } = await getWizardFormData();

  return (
    <WizardShell vehicleId={null} activeStep={1} counts={null}>
      <Step1Form categories={categories} icons={icons} vehicleId={null} />
    </WizardShell>
  );
}
