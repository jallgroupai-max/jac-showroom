import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./admin.css";

// Tipografía propia del panel (prototipo): Plus Jakarta Sans 400–800.
// El showroom público usa otra fuente — este layout solo afecta a /admin.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Panel de administración — JAC Showroom",
  // El panel jamás se indexa (plan §2.1); el proxy añade además X-Robots-Tag.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`admin-root min-h-dvh ${jakarta.variable}`}>{children}</div>;
}
