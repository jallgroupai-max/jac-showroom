import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { AdminHeader } from "./admin-header";

// Todo lo que cuelga de (panel) exige sesión. El proxy ya redirige sin
// cookie, pero esta verificación llega hasta la DB: un JWT válido de un
// usuario dado de baja también rebota (defensa en profundidad, plan §2.1).
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getAdminUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <AdminHeader userName={user.name} />
      {children}
    </div>
  );
}
