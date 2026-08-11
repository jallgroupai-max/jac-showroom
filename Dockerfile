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
# Sin esto el build usa el cliente stub de @prisma/client (nunca generado) —
# el chequeo de tipos falla en cualquier prisma.$transaction(async (tx) =>
# ...) con "tx implicitly has an any type" porque faltan los tipos reales.
# Mismo placeholder que el stage worker: prisma.config.ts exige DATABASE_URL
# al cargarse; la URL real llega por environment en runtime.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
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

# ---- migrator: aplica las migraciones de Prisma antes del deploy ----
# Mismo motivo que worker: el trace standalone del runner NO incluye la CLI
# de Prisma (nada del server la importa en runtime), así que `prisma migrate
# deploy` corre en un stage aparte con el node_modules completo de deps.
# Se construye con `target: migrator` y se ejecuta como job de un solo uso
# (docker compose run --rm migrate) ANTES de levantar el servicio showroom.
FROM node:22-alpine AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- seeder: admin, categorías, dealer e íconos de hotspot ----
# prisma/seed.mjs es idempotente (upsert) — correrlo en cada deploy no
# duplica ni resetea datos existentes. Necesita el cliente de Prisma
# generado (no solo el stub) porque hace queries reales, a diferencia de
# migrator. Se ejecuta con `target: seeder` como job de un solo uso
# (docker compose run --rm seed), típicamente DESPUÉS de migrate.
FROM node:22-alpine AS seeder
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
CMD ["node", "prisma/seed.mjs"]

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
