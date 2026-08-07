"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Vehicle, VehicleVariant } from "@/lib/types";

interface LeadConfirmationProps {
  vehicle: Vehicle;
  variant: VehicleVariant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pantalla de confirmación — capturada en la conversación. Sin CTA de
 * WhatsApp (retirado a pedido): el contacto lo inicia el asesor. */
export function LeadConfirmation({ vehicle, variant, open, onOpenChange }: LeadConfirmationProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <span className="text-2xl text-green-600" aria-hidden>
            ✓
          </span>
        </div>
        <h2 className="mt-5 text-lg font-extrabold text-[#12141A]">¡Listo! Recibimos tus datos</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
          Un asesor se pondrá en contacto contigo muy pronto para hablar sobre tu {vehicle.technicalName}{" "}
          {vehicle.trimLabel} · {variant.colorName}.
        </p>
        <div className="mx-auto mt-4 flex w-fit items-center gap-1.5 rounded-full bg-[#F4F6F9] px-3 py-1.5 text-xs font-medium text-[#6B7280]">
          <span aria-hidden>⏱</span> Respuesta estimada: menos de 24 h
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="mt-6 w-full rounded-full bg-[#111318] py-3 text-sm font-semibold text-white"
        >
          Volver al showroom
        </button>
      </DialogContent>
    </Dialog>
  );
}
