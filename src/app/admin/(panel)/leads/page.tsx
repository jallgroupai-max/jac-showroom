import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { RetryLeadButton } from "./retry-button";

// Bandeja de leads (plan A6) — el showroom los persiste ANTES de intentar el
// CRM (TRD §6.2) y hasta ahora nadie tenía dónde verlos. Filtro por estado
// de sincronización, búsqueda, reintento manual y export CSV.

const STATUS_FILTERS = [
  { key: "todos", label: "Todos", where: {} },
  { key: "enviados", label: "Enviados", where: { syncStatus: "SENT" } },
  { key: "fallidos", label: "Fallidos", where: { syncStatus: "FAILED" } },
  { key: "pendientes", label: "Pendientes", where: { syncStatus: "PENDING" } },
] as const;

const CHANNEL_LABEL: Record<string, string> = { WHATSAPP: "WhatsApp", CALL: "Llamada", EMAIL: "Correo" };
const STATUS_LABEL: Record<string, string> = { SENT: "Enviado", FAILED: "Fallido", PENDING: "Pendiente" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const { estado, q } = await searchParams;
  const filter = STATUS_FILTERS.find((f) => f.key === estado) ?? STATUS_FILTERS[0];

  const where: Prisma.LeadWhereInput = {
    ...filter.where,
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { vehicleCommercialName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [leads, total, failed] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { dealer: true },
    }),
    prisma.lead.count(),
    prisma.lead.count({ where: { syncStatus: "FAILED" } }),
  ]);

  const pill = (isActive: boolean) =>
    `flex h-[34px] items-center rounded-full border px-4 text-[12.5px] font-semibold no-underline ${
      isActive
        ? "border-black bg-black text-white"
        : "border-[var(--adm-border-input)] bg-white text-black hover:border-black"
    }`;

  return (
    <main className="flex flex-col gap-[26px] px-10 pb-[60px] pt-[34px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">Leads recibidos</h2>
          <p className="text-sm text-[var(--adm-muted)]">
            {total} en total
            {failed > 0 ? (
              <>
                {" "}
                · <span className="font-semibold text-[#b42318]">{failed} sin sincronizar con el CRM</span>
              </>
            ) : (
              " · todos sincronizados"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <form method="GET" className="flex h-[42px] items-center gap-[9px] rounded-full border border-[var(--adm-border-input)] px-4">
            {estado ? <input type="hidden" name="estado" value={estado} /> : null}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5L21 21" />
            </svg>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Nombre, correo, vehículo…"
              className="w-[180px] border-none bg-transparent text-[13px] outline-none"
            />
          </form>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- es
              una descarga de archivo (route handler), no una navegación. */}
          <a
            href="/api/admin/leads/export"
            className="flex h-[42px] items-center gap-2 rounded-full border border-black bg-white px-5 text-[13px] font-semibold text-black no-underline transition-colors hover:bg-black hover:text-white"
          >
            Exportar CSV
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/leads${f.key === "todos" ? "" : `?estado=${f.key}`}${q ? `${f.key === "todos" ? "?" : "&"}q=${encodeURIComponent(q)}` : ""}`}
            className={pill(filter.key === f.key)}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-[#cfcfcf] bg-[var(--adm-surface-soft)] text-center">
          <span className="text-sm font-semibold">
            {q || estado ? "Sin leads con estos filtros" : "Aún no hay leads"}
          </span>
          <span className="text-xs text-[var(--adm-faint)]">
            Llegan desde el formulario «Me interesa» del showroom.
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[var(--adm-line)]">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--adm-line)] text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-fainter)]">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Vehículo</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Prueba</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">CRM</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-[var(--adm-line-soft)] text-[13px] last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--adm-faint)]">
                    {lead.createdAt.toLocaleDateString("es-VE", { day: "2-digit", month: "short" })}{" "}
                    {lead.createdAt.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{lead.fullName}</div>
                    <div className="text-xs text-[var(--adm-faint)]">
                      {lead.phone} · {lead.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{lead.vehicleCommercialName}</div>
                    <div className="text-xs text-[var(--adm-faint)]">
                      {lead.vehicleTechnicalName} · {lead.variantColorName}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{CHANNEL_LABEL[lead.contactChannel]}</td>
                  <td className="px-4 py-3">{lead.wantsTestDrive ? "Sí" : "No"}</td>
                  <td className="px-4 py-3 capitalize">{lead.origin.toLowerCase()}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.04em] ${
                        lead.syncStatus === "SENT"
                          ? "bg-black text-white"
                          : lead.syncStatus === "FAILED"
                            ? "bg-[#fef3f2] text-[#b42318]"
                            : "border border-[var(--adm-border-input)] text-[var(--adm-faint)]"
                      }`}
                    >
                      {STATUS_LABEL[lead.syncStatus]}
                      {lead.syncAttempts > 1 ? ` ·${lead.syncAttempts}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {lead.syncStatus !== "SENT" ? <RetryLeadButton leadId={lead.id} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
