import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WizardShell } from "../wizard/wizard-shell";
import { Step1Form } from "../wizard/step1-form";
import { Step2SpecsForm } from "../wizard/step2-specs-form";
import { Step3Gallery, type GalleryColor } from "../wizard/step3-gallery";
import { Step4Features } from "../wizard/step4-features";
import { Step5Interior } from "../wizard/step5-interior";
import { Step6Scenarios } from "../wizard/step6-scenarios";
import { getWizardFormData, getVehicleWithCounts } from "../wizard/data";
import { WIZARD_STEPS } from "../wizard/steps";
import { PublishBar } from "../wizard/publish-bar";
import { getPublishBlockers } from "../actions";

// Edición por pasos de un vehículo existente. ?paso=N — los pasos de fases
// futuras (3-6) caen al paso 1 hasta que su fase los habilite.
export default async function EditarVehiculoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paso?: string }>;
}) {
  const [{ id }, { paso }] = await Promise.all([params, searchParams]);

  const result = await getVehicleWithCounts(id);
  if (!result || result.vehicle.status === "ARCHIVED") notFound();
  const { vehicle, counts } = result;

  const requested = Number(paso) || 1;
  const step = WIZARD_STEPS.find((s) => s.num === requested && s.pendingPhase === null)
    ? requested
    : 1;

  const blockers = vehicle.status === "DRAFT" ? await getPublishBlockers(vehicle.id) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PublishBar
        vehicleId={vehicle.id}
        status={vehicle.status as "DRAFT" | "PUBLISHED" | "PAUSED"}
        blockers={blockers}
      />
      <WizardShell vehicleId={vehicle.id} activeStep={step} counts={counts}>
      {step === 6 ? (
        <Step6ScenariosLoader vehicle={vehicle} />
      ) : step === 4 ? (
        <Step4FeaturesLoader vehicle={vehicle} />
      ) : step === 5 ? (
        <Step5InteriorLoader vehicle={vehicle} />
      ) : step === 3 ? (
        <Step3Gallery
          vehicleId={vehicle.id}
          colors={vehicle.colors.map(
            (c): GalleryColor => ({
              id: c.id,
              colorName: c.colorName,
              colorHex: c.colorHex,
              frameCount: c.frameCount,
              spriteBasePath: c.spriteBasePath,
              profileImageUrl: c.profileImageUrl,
              job: c.jobs[0]
                ? {
                    id: c.jobs[0].id,
                    status: c.jobs[0].status,
                    progress: c.jobs[0].progress,
                    errorMessage: c.jobs[0].errorMessage,
                    errorKind: c.jobs[0].errorKind,
                    attempts: c.jobs[0].attempts,
                    queuePosition: null,
                  }
                : null,
            }),
          )}
        />
      ) : step === 2 ? (
        <Step2SpecsForm
          vehicleId={vehicle.id}
          defaults={{
            warrantyLabel: vehicle.warrantyLabel,
            groups: vehicle.specGroups.map((g) => ({
              title: g.title,
              items: g.items.map((i) => ({ label: i.label, value: i.value })),
            })),
          }}
        />
      ) : (
        <Step1FormLoader vehicle={vehicle} />
      )}
      </WizardShell>
    </div>
  );
}

type LoadedVehicle = NonNullable<Awaited<ReturnType<typeof getVehicleWithCounts>>>["vehicle"];

// Paso 6: todo el catálogo global + el estado de habilitación de ESTE
// vehículo (VehicleScenario.enabled).
async function Step6ScenariosLoader({ vehicle }: { vehicle: LoadedVehicle }) {
  const [allScenarios, joins] = await Promise.all([
    prisma.scenario.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.vehicleScenario.findMany({ where: { vehicleId: vehicle.id } }),
  ]);
  const enabledIds = new Set(joins.filter((j) => j.enabled).map((j) => j.scenarioId));
  return (
    <Step6Scenarios
      vehicleId={vehicle.id}
      ownBackgroundUrl={vehicle.ownBackgroundUrl}
      scenarios={allScenarios.map((s) => ({
        id: s.id,
        label: s.label,
        imageUrl: s.imageUrl,
        color: s.color,
        enabled: enabledIds.has(s.id),
      }))}
    />
  );
}

// Paso 4: destacados = puntos de EXTERIOR (una sola entidad, plan §1.5).
// La vista previa del fotograma usa el sprite LOW del primer color procesado.
async function Step4FeaturesLoader({ vehicle }: { vehicle: LoadedVehicle }) {
  const { icons } = await getWizardFormData();
  const readyColor = vehicle.colors.find((c) => c.spriteBasePath !== null);
  return (
    <Step4Features
      vehicleId={vehicle.id}
      pois={vehicle.pointsOfInterest
        .filter((p) => p.mode === "EXTERIOR")
        .map((p) => ({
          id: p.id,
          iconId: p.iconId,
          title: p.title,
          description: p.description,
          imageUrl: p.imageUrl,
          frame: p.frame ?? 1,
        }))}
      icons={icons.filter((i) => i.group !== "INTERIOR")}
      framePreviewBase={readyColor?.spriteBasePath ? `${readyColor.spriteBasePath}/low` : null}
    />
  );
}

async function Step5InteriorLoader({ vehicle }: { vehicle: LoadedVehicle }) {
  const { icons } = await getWizardFormData();
  return (
    <Step5Interior
      vehicleId={vehicle.id}
      panoramaUrl={vehicle.interiorPanoramaUrl}
      pois={vehicle.pointsOfInterest
        .filter((p) => p.mode === "INTERIOR")
        .map((p) => ({
          id: p.id,
          iconId: p.iconId,
          title: p.title,
          textureX: p.textureX,
          textureY: p.textureY,
          blink: p.blink,
        }))}
      icons={icons.filter((i) => i.group !== "EXTERIOR")}
    />
  );
}

async function Step1FormLoader({
  vehicle,
}: {
  vehicle: NonNullable<Awaited<ReturnType<typeof getVehicleWithCounts>>>["vehicle"];
}) {
  const { categories, icons } = await getWizardFormData();
  return (
    <Step1Form
      categories={categories}
      icons={icons}
      vehicleId={vehicle.id}
      defaults={{
        commercialName: vehicle.commercialName,
        technicalName: vehicle.technicalName,
        trimLabel: vehicle.trimLabel,
        typeTag: vehicle.typeTag,
        slug: vehicle.slug,
        categoryId: vehicle.categoryId,
        iconIds: vehicle.featureIcons.map((f) => f.hotspotIconId),
      }}
    />
  );
}
