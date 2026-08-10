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

## Despliegue con Docker

`docker compose up -d --build` levanta los tres servicios:

- **postgres** — base de datos (volumen `pgdata`).
- **showroom** — la web Next.js en modo standalone (puerto `${PORT:-3000}`).
- **worker** — misma imagen base construida con `target: worker` (etapa propia del `Dockerfile`); procesa los ZIP y la purga. Sin este servicio las subidas del paso 3 no se procesan.

`showroom` y `worker` comparten el volumen `uploads` montado en `/app/uploads-data`: la web guarda ahí lo que se sube desde el panel y el worker escribe los sprites procesados que la web luego sirve vía `/uploads/*`. La `DATABASE_URL` interna apunta al host `postgres` de la red de compose; `AUTH_SECRET` es obligatoria y se toma de `.env` (compose falla con un mensaje claro si falta).

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
