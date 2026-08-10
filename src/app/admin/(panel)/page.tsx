import { redirect } from "next/navigation";

// /admin no tiene contenido propio: la biblioteca de vehículos es la home
// del panel (igual que en el prototipo, donde goAdmin lleva a "vehiculos").
export default function AdminIndexPage() {
  redirect("/admin/vehiculos");
}
