# syntax=docker/dockerfile:1
# Imagen de producción del showroom 360° — build multi-stage con el patrón
# "output: standalone" de Next.js: la imagen final solo lleva server.js, los
# node_modules trazados, los estáticos del build y public/ (sprites 360°,
# fondos e íconos). Next 16 exige Node >= 20.9.

# ---- deps: dependencias reproducibles desde el lockfile ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compila la app en modo standalone ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Activa output:"standalone" solo acá (ver next.config.ts) — el flujo local
# de `npm run build` + `npm run start` no cambia.
ENV BUILD_STANDALONE=1
RUN npm run build

# ---- runner: imagen final mínima ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# El trace standalone NO incluye public/ ni .next/static — se copian aparte.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
