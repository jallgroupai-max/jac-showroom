# JAC Motors — Showroom Virtual

Frontend Next.js del showroom virtual 360° de JAC Motors. Vive en `frontend/` dentro del proyecto, junto a `../docs/` (documentación) y `../recursos/` (capturas de referencia y assets fuente). La documentación de producto/diseño/técnica está en [`../docs/`](../docs/README.md) — léela antes de tocar código, especialmente [`../docs/UX-UI-BRIEF.md`](../docs/UX-UI-BRIEF.md) §0 (fidelidad visual no negociable contra `../recursos/diseño-ux/`).

## Correr en local

La app son **dos procesos** más Postgres — el panel de administración no funciona completo sin los tres:

```bash
docker compose up -d postgres   # 1. base de datos
npm install
npm run dev                     # 2. web (showroom + panel) — http://localhost:3000
npm run worker                  # 3. worker de assets, en OTRA terminal
```

El worker (`worker/index.mjs`) es un proceso Node aparte de Next que procesa en cola los ZIP de fotogramas 360° subidos en el paso 3 del wizard (extracción, validación y compresión con sharp) y ejecuta la purga diaria de vehículos archivados. **Si no está corriendo, las subidas de ZIP quedan "en cola" para siempre** — es el síntoma típico de haber olvidado la tercera terminal.

Variables en `.env` (ver `.env.example`): `DATABASE_URL`, `AUTH_SECRET`, credenciales del seed (`SEED_ADMIN_*`). Seed inicial: `npm run db:migrate && npm run db:seed`.

## Despliegue con Docker (VPS)

```bash
docker compose --env-file environments/.env up -d --build
```

En el VPS lo lanza `deploy_main.sh`, que hace el `git pull` y esto. El `.env`
vive en `environments/`, no en la raíz: sin `--env-file` los `${...}` del
compose quedan sin resolver.

Servicios:

- **migrate** → **seed** → **seed-catalog** — jobs de un solo uso, encadenados
  con `depends_on: service_completed_successfully` e idempotentes.
- **showroom** — la web Next.js en modo standalone. Espera solo a `migrate`.
- **worker** — misma imagen base construida con `target: worker`; consume la
  cola pg-boss `color-zip` y corre la purga diaria. **Sin este servicio las
  subidas del paso 3 se quedan en QUEUED para siempre.**

Postgres es externo (`DATABASE_URL` + red `showroom_network`), no lo levanta
este compose. `showroom` y `worker` comparten el volumen `uploads_data` en
`/app/uploads-data`: en modo disco local la web escribe ahí el ZIP y el worker
lo lee (mismo uid 1001 en las dos imágenes). Con `S3_*` definidas, ese volumen
solo se usa como scratch de extracción.

### nginx: obligatorio para que las subidas 360° funcionen

`client_max_body_size` vale **1 MB** por defecto en nginx, así que rechaza los
ZIP con un 413 antes de que lleguen al contenedor. Hay que aplicar el
fragmento de [`deploy/nginx-showroom.conf.example`](deploy/nginx-showroom.conf.example)
— sube el límite y, sobre todo, activa `proxy_request_buffering off` para que
nginx no acumule el archivo entero en su propio disco.

### Verificar que el worker quedó arriba

```bash
bash deploy/check-worker.sh
```

Comprueba `jac-showroom` y `jac-showroom-worker` por nombre exacto. Es el
fallo silencioso de este sistema: si el worker no arranca, la web funciona
igual y los ZIP se van acumulando en QUEUED sin que nadie se entere.

`deploy_main.sh` no lo llama por defecto — ese script suele estar modificado
localmente en cada host y tocarlo desde el repo bloquea su propio `git pull`.
Añadir `bash deploy/check-worker.sh` al final del script local es opcional.

### Recursos del worker

Comprimir 36 fotogramas en tres calidades satura CPU, y en el VPS el worker
comparte host con la web. `WORKER_CPUS`, `WORKER_MEMORY` y
`WORKER_SHARP_CONCURRENCY` (ver `environments/.env.example`) acotan cuánta
máquina puede llevarse mientras procesa. Con cores de sobra, subirlos acelera
las subidas.

## Estado del proyecto

Implementación **Fase 0-3** del [plan de implementación](../docs/IMPLEMENTATION-PLAN.md): visualizador 360° funcional (rotación, carga progresiva por calidad, caché de sesión, Escena, Exterior/Interior), catálogo, puntos de interés, panel de especificaciones, formulario de lead + confirmación contra un mock de Odoo. Construido con datos mock (`src/lib/mock-data.ts`) — ver "funcional primero, integrar después" en el plan.

**Limitación conocida y visible en la propia UI**: todavía no existe un set de fotos 360° por modelo — todos los vehículos comparten el único prototipo real recibido (`../recursos/QUALITYS/`) como demo del mecanismo. El visualizador muestra un aviso de "vista previa técnica" mientras esto sea así (Fase 4 del plan).

## Estructura

- `src/lib/types.ts` — modelo de datos (misma forma que tendrá el CMS real).
- `src/lib/mock-data.ts` — catálogo mock, fiel al texto/specs de las capturas de referencia.
- `src/lib/connection.ts`, `src/lib/sprite-cache.ts` — detección híbrida de conexión + carga progresiva/caché de sesión de sprites.
- `src/hooks/` — `use-rotation` (drag + teclado), `use-sprite-quality`.
- `src/components/showroom/` — `showroom-app.tsx` es el orquestador (máquina de estados Loading → Catálogo → Visualizador).
- `src/app/api/leads/route.ts` — mock del endpoint de Odoo.
