# JAC Motors — Showroom Virtual

Frontend Next.js del showroom virtual 360° de JAC Motors. Vive en `frontend/` dentro del proyecto, junto a `../docs/` (documentación) y `../recursos/` (capturas de referencia y assets fuente). La documentación de producto/diseño/técnica está en [`../docs/`](../docs/README.md) — léela antes de tocar código, especialmente [`../docs/UX-UI-BRIEF.md`](../docs/UX-UI-BRIEF.md) §0 (fidelidad visual no negociable contra `../recursos/diseño-ux/`).

## Correr en local

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

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
