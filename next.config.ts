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
};

export default nextConfig;
