"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Vehicle } from "@/lib/types";

interface SpecsPanelProps {
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Panel de especificaciones — recursos/diseño-ux/Home-2.1.0-Details-Desktop.png.
 * shadcn Sheet ya resuelve focus trap + cierre con Esc (gap de accesibilidad
 * de docs/UX-UI-BRIEF.md §7).
 */
export function SpecsPanel({ vehicle, open, onOpenChange }: SpecsPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-none bg-[#242425] p-6 text-white sm:max-w-sm">
        <SheetHeader className="p-0">
          <SheetTitle className="text-lg font-bold text-white">
            {vehicle.commercialName} {vehicle.trimLabel}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-6 overflow-y-auto">
          {vehicle.specGroups.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/50">{group.title}</p>
              <dl className="mt-3 flex flex-col divide-y divide-white/10">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2.5 text-sm">
                    <dt className="text-white/70">{item.label}</dt>
                    <dd className="font-semibold text-white">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}

          <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white">
            <span aria-hidden>✓</span> {vehicle.warrantyLabel}
          </div>

          <p className="text-xs text-white/40">Haz clic « o arrastra el coche para ocultar</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
