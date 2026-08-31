import { prisma } from "@/lib/prisma";
import { listAvailableAssetIcons } from "@/lib/admin/services/hotspot-icons";
import { HotspotIconImage } from "../vehiculos/wizard/catalog-icon";
import { IconModal } from "./icon-modal";
import { DeleteIconButton } from "./delete-icon-button";

// Catálogo de íconos — un catálogo, dos usos (plan §1.2): los chips de
// combustible/tracción de la card (grupo GENERAL) y el marcador de los puntos
// de interés de exterior e interior. Se lista por grupo porque es así como lo
// consume el wizard: el paso 1 ve solo GENERAL, el 4 EXTERIOR y el 5 INTERIOR.
const GROUPS = [
  {
    key: "EXTERIOR" as const,
    title: "Exterior",
    hint: "Puntos de interés sobre el vehículo en vista 360° (paso 4)",
  },
  {
    key: "INTERIOR" as const,
    title: "Interior",
    hint: "Marcadores sobre la panorámica del interior (paso 5)",
  },
  {
    key: "GENERAL" as const,
    title: "General",
    hint: "Combustible y tracción — chips de la card del catálogo (paso 1)",
  },
];

export default async function IconosPage() {
  const [icons, availableAssets] = await Promise.all([
    prisma.hotspotIcon.findMany({
      orderBy: [{ order: "asc" }, { label: "asc" }],
      include: { _count: { select: { pointsOfInterest: true, vehicleFeatures: true } } },
    }),
    listAvailableAssetIcons(),
  ]);

  return (
    <main className="flex flex-col gap-[30px] px-10 pb-[60px] pt-[34px]">
      <div className="flex items-end justify-between gap-5">
        <div>
          <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">Catálogo de íconos</h2>
          <p className="text-sm text-[var(--adm-muted)]">
            {icons.length} {icons.length === 1 ? "ícono" : "íconos"} disponibles para los puntos de
            interés y las características de la card
            {availableAssets.length > 0
              ? ` · ${availableAssets.length} más en la biblioteca del proyecto`
              : ""}
          </p>
        </div>
        <IconModal mode="create" availableAssets={availableAssets} />
      </div>

      {GROUPS.map((group) => {
        const groupIcons = icons.filter((i) => i.group === group.key);
        return (
          <section key={group.key} className="flex flex-col gap-3.5">
            <div className="flex items-baseline gap-3">
              <h3 className="text-sm font-bold">{group.title}</h3>
              <span className="text-[12.5px] text-[var(--adm-fainter)]">{group.hint}</span>
              <span className="ml-auto text-[11.5px] text-[var(--adm-faint)]">
                {groupIcons.length} {groupIcons.length === 1 ? "ícono" : "íconos"}
              </span>
            </div>

            {groupIcons.length === 0 ? (
              <p className="rounded-[18px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] p-[18px] text-[13px] text-[var(--adm-faint)]">
                Sin íconos en este grupo — el paso correspondiente del wizard no tendrá ninguno que
                ofrecer.
              </p>
            ) : (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]">
                {groupIcons.map((icon) => {
                  const uses = icon._count.pointsOfInterest + icon._count.vehicleFeatures;
                  return (
                    <div
                      key={icon.id}
                      className="flex flex-col gap-3 rounded-[16px] border border-[var(--adm-line)] bg-white p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] border border-[var(--adm-line)] bg-[var(--adm-surface-soft)] p-2">
                          <HotspotIconImage icon={icon} size={26} />
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-[13.5px] font-bold tracking-[-0.01em]">
                            {icon.label}
                          </span>
                          <span className="mt-0.5 truncate text-[11px] text-[var(--adm-fainter)]">
                            {uses === 0 ? "Sin usar" : `En uso · ${uses}`}
                            {icon.iconUrl ? " · SVG propio" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 border-t border-[var(--adm-line-soft)] pt-3">
                        <IconModal
                          mode="edit"
                          icon={{
                            id: icon.id,
                            label: icon.label,
                            group: icon.group,
                            iconUrl: icon.iconUrl,
                            assetName: icon.assetName,
                            svgPath: icon.svgPath,
                          }}
                        />
                        <DeleteIconButton iconId={icon.id} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
