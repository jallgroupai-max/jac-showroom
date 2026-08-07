import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // "standalone" SOLO para la imagen Docker (el Dockerfile exporta
  // BUILD_STANDALONE=1): genera .next/standalone con server.js y los
  // node_modules mínimos trazados. El flujo local de `npm run build` +
  // `npm run start` queda exactamente igual que siempre.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
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
    ];
  },
};

export default nextConfig;
