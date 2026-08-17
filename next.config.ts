import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Ya no hay Server Actions en el proyecto (plan A7 — hotfix WAF: todas las
  // mutaciones del panel son Route Handlers con cuerpo JSON, ver
  // src/lib/admin/api.ts), así que `experimental.serverActions.bodySizeLimit`
  // quedó sin efecto y se retiró. Los Route Handlers no imponen el límite de
  // 1MB que sí tenían las actions. Los ZIP de 360° siguen sin pasar por aquí
  // — van directo al storage (plan §2.3).
  // "standalone" SOLO para la imagen Docker (el Dockerfile exporta
  // BUILD_STANDALONE=1): genera .next/standalone con server.js y los
  // node_modules mínimos trazados. El flujo local de `npm run build` +
  // `npm run start` queda exactamente igual que siempre.
  output: "standalone",
  // Los assets de /public se sirven por defecto con max-age=0 (revalidar en
  // cada uso): cada <img> nuevo con la misma URL volvía a la red y las
  // imágenes aparecían de a poco pese a la precarga del Loading. Caché de 1h
  // con stale-while-revalidate: reuso instantáneo en la sesión/recargas, y
  // los assets nuevos de un deploy se recogen en segundo plano.
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
      // Cabeceras de seguridad base (plan A7). Sin frame-ancestors global:
      // el TRD §7 anticipa un futuro modo widget embebible del showroom —
      // el PANEL sí lo bloquea (X-Frame-Options en el proxy).
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
