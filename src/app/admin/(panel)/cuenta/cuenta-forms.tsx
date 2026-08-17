"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOwnProfile, changeOwnPassword } from "@/lib/admin/api";

const inputClass =
  "h-[46px] rounded-[12px] border border-[var(--adm-border-input)] bg-white px-3.5 text-sm";
const labelClass = "text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]";
const primaryBtn =
  "h-11 cursor-pointer rounded-full bg-black px-6 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--adm-hover)] disabled:opacity-60";

function useFormAction(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = (fd: FormData) => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) setError(result.error ?? "Error");
      else {
        setDone(true);
        router.refresh();
      }
    });
  };
  return { submit, isPending, error, done };
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const f = useFormAction(updateOwnProfile);
  return (
    <form action={f.submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Nombre</span>
        <input name="name" defaultValue={name} className={inputClass} />
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Correo</span>
        <input name="email" type="email" defaultValue={email} className={inputClass} />
      </label>
      {f.error ? <p className="text-xs font-semibold text-[#b42318]">{f.error}</p> : null}
      {f.done ? <p className="text-xs font-semibold text-[#067647]">Datos guardados.</p> : null}
      <button type="submit" disabled={f.isPending} className={`${primaryBtn} self-end`}>
        {f.isPending ? "Guardando…" : "Guardar datos"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const f = useFormAction(changeOwnPassword);
  return (
    <form action={f.submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Contraseña actual</span>
        <input name="current" type="password" autoComplete="current-password" className={inputClass} />
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Nueva contraseña</span>
        <input name="next" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" className={inputClass} />
      </label>
      {f.error ? <p className="text-xs font-semibold text-[#b42318]">{f.error}</p> : null}
      {f.done ? <p className="text-xs font-semibold text-[#067647]">Contraseña actualizada.</p> : null}
      <button type="submit" disabled={f.isPending} className={`${primaryBtn} self-end`}>
        {f.isPending ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
