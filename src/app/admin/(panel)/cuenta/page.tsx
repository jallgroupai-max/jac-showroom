import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { ProfileForm, PasswordForm } from "./cuenta-forms";

// Mi cuenta — el panel tiene UN solo tipo de usuario (decisión de producto:
// solo administra el showroom), así que aquí se edita la cuenta propia y
// nada más. Sin gestión de usuarios ni roles.
export default async function CuentaPage() {
  const user = await getAdminUser();
  if (!user) redirect("/admin/login");

  return (
    <main className="flex flex-col gap-[26px] px-10 pb-[60px] pt-[34px]">
      <div>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.025em]">Mi cuenta</h2>
        <p className="text-sm text-[var(--adm-muted)]">
          Datos de acceso del administrador del showroom.
        </p>
      </div>

      <div className="grid max-w-[880px] items-start gap-[22px] lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-[18px] border border-[var(--adm-line)] p-[22px]">
          <h3 className="text-[17px] font-bold tracking-[-0.02em]">Datos</h3>
          <ProfileForm name={user.name} email={user.email} />
        </section>

        <section className="flex flex-col gap-4 rounded-[18px] border border-[var(--adm-line)] p-[22px]">
          <h3 className="text-[17px] font-bold tracking-[-0.02em]">Contraseña</h3>
          <PasswordForm />
        </section>
      </div>
    </main>
  );
}
