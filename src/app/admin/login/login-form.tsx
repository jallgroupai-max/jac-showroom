"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

// Réplica 1:1 de la columna derecha del Login del prototipo (plan §0.6):
// inputs de 50px radio 12, botón pill negro de 52px, checkbox accent negro.
//
// POST JSON a un Route Handler en vez de Server Action bindeada al form
// (plan A7 — hotfix WAF): `<form action={serverAction}>` hace que React
// serialice la llamada como multipart/form-data con campos
// `$ACTION_REF`/`$ACTION_KEY`, que el WAF de producción bloquea como
// posible inyección NoSQL. Ver src/app/api/admin/login/route.ts.
export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setErrorMessage(undefined);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
          redirectTo: formData.get("redirectTo"),
        }),
      });

      const data = (await response.json()) as { redirectTo?: string; error?: string };

      if (!response.ok) {
        setErrorMessage(data.error ?? "Correo o contraseña incorrectos.");
        setIsPending(false);
        return;
      }

      router.push(data.redirectTo ?? "/admin");
      router.refresh();
    } catch {
      setErrorMessage("No se pudo conectar con el servidor. Intenta de nuevo.");
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-[400px] flex-col gap-[26px]">
      <div>
        <h2 className="mb-2 text-[28px] font-bold tracking-[-0.025em]">Iniciar sesión</h2>
        <p className="text-sm text-[var(--adm-muted)]">Accede con tu cuenta corporativa.</p>
      </div>

      <input type="hidden" name="redirectTo" value={callbackUrl} />

      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
          Correo
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="admin@jac.com.ve"
          className="h-[50px] rounded-[12px] border border-[var(--adm-border-input)] bg-white px-4 text-[15px]"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
          Contraseña
        </span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            required
            autoComplete="current-password"
            className="h-[50px] w-full rounded-[12px] border border-[var(--adm-border-input)] bg-white px-4 pr-11 text-[15px] tracking-[0.1em]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
            tabIndex={-1}
            className="absolute right-3 top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center border-none bg-transparent p-1 text-[#6b6b6b] hover:text-black"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>

      <div className="flex items-center justify-between text-[13px] text-[var(--adm-ink-soft)]">
        <label className="flex cursor-pointer items-center gap-[9px]">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="m-0 h-4 w-4 accent-black"
          />
          <span>Mantener sesión</span>
        </label>
        <a href="#recuperar" className="adm-link">
          ¿Olvidaste tu clave?
        </a>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-[13px] font-semibold text-[#b42318]">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="h-[52px] cursor-pointer rounded-full border-none bg-black text-[15px] font-semibold tracking-[0.01em] text-white transition-colors hover:bg-[var(--adm-hover)] disabled:opacity-60"
      >
        {isPending ? "Entrando…" : "Entrar al panel"}
      </button>

      <div className="h-px bg-[var(--adm-line-soft)]" />

      <p className="text-xs leading-[1.6] text-[var(--adm-fainter)]">
        Uso restringido a personal autorizado. Toda actividad queda registrada.
      </p>
    </form>
  );
}
