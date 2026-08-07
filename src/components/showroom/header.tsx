import { forwardRef } from "react";
import { Maximize, Minimize } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  onMeInteresa: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

/**
 * Cabecera persistente — ver capturas Home-1.0.0 / Home-2.0.0 (recursos/diseño-ux).
 * Siempre `fixed` (en ambos modos) para que el cambio a "pantalla completa"
 * no sea un salto de `position` (eso no se puede animar) — lo único que
 * transiciona, con `transition-colors`, es el fondo/borde entre sólido y
 * transparente; showroom-app.tsx anima en paralelo (Framer Motion) el alto
 * del espacio que le reserva, así el visualizador crece/encoge en sync. El
 * propio `<header>` usa `pointer-events-none` para que el espacio vacío del
 * medio (entre el logo y los botones) deje pasar los clics a lo que hay
 * detrás cuando está flotando — solo el logo y los botones, en sus propios
 * contenedores, vuelven a aceptar clics.
 *
 * En mobile/tablet (<lg, no negociable) no hay botones — ni pantalla
 * completa ni "Me Interesa" (ese CTA vive en su propia barra, en flujo
 * normal debajo del catálogo/controles, en showroom-app.tsx) — solo logo +
 * título, y el título ya no se oculta.
 */
export const Header = forwardRef<HTMLElement, HeaderProps>(function Header(
  { title, onMeInteresa, isFullscreen, onToggleFullscreen },
  ref
) {
  return (
    <header
      ref={ref}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b px-4 py-4 transition-colors duration-300 ease-in-out sm:px-8",
        isFullscreen ? "border-black/0 bg-[#F4F6F9]/0" : "border-black/5 bg-[#F4F6F9]"
      )}
    >
      <div
        className={cn(
          "pointer-events-auto flex min-w-0 flex-1 items-center gap-3 rounded-full transition-all duration-300 ease-in-out lg:flex-none",
          isFullscreen ? "bg-white/90 px-4 py-2 shadow-md backdrop-blur" : "px-0 py-0"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- logo servido directo desde /public */}
        <img src="/assets/logo-navbar.png" alt="JAC" className="h-6 w-auto shrink-0" />
        <span className="truncate text-sm font-semibold text-[#12141A] sm:text-base">{title}</span>
      </div>
      <div className="pointer-events-auto hidden items-center gap-2 lg:flex">
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#12141A] shadow-sm transition-all hover:bg-[#111318] hover:text-white focus-visible:bg-[#111318] focus-visible:text-white focus-visible:outline-none"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onMeInteresa}
          className="rounded-full bg-[#111318] px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-95"
        >
          Me Interesa
        </button>
      </div>
    </header>
  );
});
