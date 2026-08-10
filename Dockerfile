# syntax=docker/dockerfile:1
# Imagen de producción del showroom 360° — build multi-stage con el patrón
# "output: standalone" de Next.js: la imagen final solo lleva server.js, los
# node_modules trazados, los estáticos del build y public/ (sprites 360°,
# fondos e íconos). Next 16 exige Node >= 20.9.

# ---- deps: dependencias desde el lockfile ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm install` y NO `npm ci`: el lockfile generado en Windows omite las
# transitivas de los bindings opcionales de otras plataformas
# (@unrs/*-wasm32-wasi → @emnapi/*) y el chequeo estricto de `npm ci` en
# Linux lo rechaza (EUSAGE Missing). `npm install` respeta las versiones del
# lock y solo rellena esos huecos resolviéndolos.
RUN npm install --no-audit --no-fund

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

# ---- worker: procesa los ZIP de colores y la purga diaria ----
# Proceso Node aparte de Next (worker/index.mjs): pg-boss + sharp + unzipper
# sobre el node_modules completo de deps (el trace standalone de Next NO
# incluye las dependencias que solo usa el worker). Se construye con
# `target: worker` desde docker-compose.
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
COPY worker ./worker
# prisma.config.ts exige DATABASE_URL al cargarse; para generate basta un
# placeholder — la URL real llega por environment en runtime (compose).
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# Mismo uid/gid que el runner: ambos contenedores comparten el volumen de
# uploads y los archivos deben poder leerse/escribirse desde los dos lados.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p uploads-data \
  && chown nextjs:nodejs uploads-data
USER nextjs
CMD ["node", "worker/index.mjs"]

# ---- runner: imagen final mínima ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  # Punto de montaje del volumen de uploads con el dueño correcto — si lo
  # crea el runtime de Docker quedaría root y nextjs no podría escribir.
  && mkdir -p uploads-data \
  && chown nextjs:nodejs uploads-data

# El trace standalone NO incluye public/ ni .next/static — se copian aparte.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
