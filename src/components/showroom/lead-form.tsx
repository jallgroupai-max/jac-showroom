"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { ContactChannel, LeadPayload, Vehicle, VehicleVariant } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LeadFormProps {
  vehicle: Vehicle;
  variant: VehicleVariant;
  /** Concesionarios activos — del catálogo (DB); hoy uno solo (Barquisimeto). */
  dealers: Array<{ id: string; city: string; active: boolean }>;
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
export function LeadForm({ vehicle, variant, dealers, open, onOpenChange, onSuccess }: LeadFormProps) {
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
    // Honeypot anti-spam (TRD §6.1): campo invisible para humanos; los bots
    // que rellenan todo lo delatan. Se envía junto al payload.
    const honeypot =
      (e.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>('input[name="website"]')
        ?.value ?? "";
    const payload: LeadPayload & { website?: string } = {
      website: honeypot,
      fullName,
      phone,
      email,
      dealerId: dealers[0].id,
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
      <DialogContent
        className={cn(
          // Desktop (≥lg): modal centrado, sin cambios respecto a antes.
          "lg:top-1/2 lg:left-1/2 lg:max-w-md lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:p-6",
          // Mobile/tablet (<lg): hoja a pantalla completa (100% ancho y
          // alto), con scroll propio si el formulario no entra, más padding
          // lateral que el de desktop y sin esquinas redondeadas (ocupa todo
          // el borde de la pantalla).
          "max-lg:fixed max-lg:inset-0 max-lg:h-dvh max-lg:w-screen max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:overflow-y-auto max-lg:rounded-none max-lg:px-8 max-lg:py-6",
          // Animación: el zoom-in/zoom-out base queda solo para desktop; en
          // mobile se reemplaza por un slide desde abajo hacia arriba (fiel
          // al gesto típico de un formulario deslizándose en apps mobile).
          "data-open:zoom-in-100 data-closed:zoom-out-100 lg:data-open:zoom-in-95 lg:data-closed:zoom-out-95",
          "max-lg:data-open:slide-in-from-bottom max-lg:data-closed:slide-out-to-bottom max-lg:duration-300"
        )}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-extrabold text-[#12141A]">Me interesa este vehículo</DialogTitle>
          <p className="text-sm text-[#6B7280]">
            {vehicle.technicalName} {vehicle.trimLabel} · {variant.colorName} — déjanos tus datos y un asesor te
            contactará
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-4">
          {/* Honeypot: invisible y fuera del orden de tabulación — un humano
              jamás lo llena; un bot que rellena todo, sí. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
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
