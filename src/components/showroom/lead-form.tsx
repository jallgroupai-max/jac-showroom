"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { ContactChannel, LeadPayload, Vehicle, VehicleVariant } from "@/lib/types";
import { DEALERS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface LeadFormProps {
  vehicle: Vehicle;
  variant: VehicleVariant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const CHANNELS: { id: ContactChannel; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "call", label: "Llamada" },
  { id: "email", label: "Correo" },
];

/** Formulario "Me interesa este vehículo" — capturado en la conversación. */
export function LeadForm({ vehicle, variant, open, onOpenChange, onSuccess }: LeadFormProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<ContactChannel>("whatsapp");
  const [wantsTestDrive, setWantsTestDrive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const payload: LeadPayload = {
      fullName,
      phone,
      email,
      dealerId: DEALERS[0].id,
      contactChannel: channel,
      wantsTestDrive,
      vehicleSlug: vehicle.slug,
      vehicleCommercialName: vehicle.commercialName,
      vehicleTechnicalName: vehicle.technicalName,
      variantColorName: variant.colorName,
      origin: typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop",
    };
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("No se pudo enviar");
      onSuccess();
    } catch {
      setError("No pudimos enviar tus datos. Intenta de nuevo en unos segundos.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-extrabold text-[#12141A]">Me interesa este vehículo</DialogTitle>
          <p className="text-sm text-[#6B7280]">
            {vehicle.technicalName} {vehicle.trimLabel} · {variant.colorName} — déjanos tus datos y un asesor te
            contactará
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">Nombre completo</Label>
            <Input
              id="fullName"
              required
              placeholder="Ej. Ana Martínez"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="bg-[#F4F6F9]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Teléfono / WhatsApp</Label>
            <Input
              id="phone"
              required
              placeholder="+58 000 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="bg-[#F4F6F9]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="nombre@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[#F4F6F9]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dealer">Ciudad / Concesionario</Label>
            <select
              id="dealer"
              disabled
              value={DEALERS[0].id}
              className="h-9 rounded-md border border-input bg-[#F4F6F9] px-3 text-sm text-[#12141A] disabled:opacity-100"
            >
              <option value={DEALERS[0].id}>{DEALERS[0].city}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>¿Cómo prefieres que te contactemos?</Label>
            <div className="flex gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannel(c.id)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                    channel === c.id ? "bg-[#111318] text-white" : "bg-[#F4F6F9] text-[#6B7280]"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#12141A]">
            <Checkbox checked={wantsTestDrive} onCheckedChange={(v) => setWantsTestDrive(v === true)} />
            Quiero agendar una prueba de manejo
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-full bg-[#111318] py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          >
            {submitting ? "Enviando…" : "Enviar — un asesor te contactará"}
          </button>

          <p className="text-center text-[11px] leading-relaxed text-[#9CA3AF]">
            Al enviar aceptas nuestra política de privacidad y el tratamiento de tus datos para fines comerciales.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
