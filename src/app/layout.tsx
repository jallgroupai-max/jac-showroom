import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter queda solo como último fallback web — la fuente por defecto de toda
// la app es Futura (ver --font-sans en globals.css).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JAC Motors — Showroom Virtual",
  description: "Explora el catálogo JAC Motors en un showroom virtual 360°.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
