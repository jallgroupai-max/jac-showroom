// Seed del catálogo — conversión FIEL de src/lib/mock-data.ts a la DB
// (plan A5: "convertir los colores/assets actuales en el primer seed real").
// Idempotente por slug. Correr con: node --env-file=.env prisma/seed-catalog.mjs
//
// Los assets siguen siendo los de /public/assets (existen desde el build), y
// los íconos referencian los SVG reales vía HotspotIcon.assetName — el
// showroom público queda visualmente IDÉNTICO al mock, byte a byte de URLs.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ——— Íconos usados por el mock (assetName = archivo real en /assets/icons).
// El path 24×24 es solo para el picker del panel; el público usa el archivo.
const MOCK_ICONS = [
  { key: "gasoil-car", label: "Gasoil", group: "GENERAL", svgPath: "M7 20V5.5a1.5 1.5 0 011.5-1.5h5A1.5 1.5 0 0115 5.5V20M5 20h12M9.5 7.5h3.5" },
  { key: "gasolina-car", label: "Gasolina", group: "GENERAL", svgPath: "M6 20V6a2 2 0 012-2h6a2 2 0 012 2v14M6 20h10M6 11h10M16 8l3 3v6a1.5 1.5 0 01-3 0" },
  { key: "4x4-car", label: "4×4", group: "GENERAL", svgPath: "M2 16h20M4 16v-4h5l2-3h4l2 3h3v4M7.5 18a1.5 1.5 0 100-3M16.5 18a1.5 1.5 0 100-3" },
  { key: "electric-car", label: "Eléctrico", group: "GENERAL", svgPath: "M13 3L5 13.5h5L9.5 21l8-10.5h-5z" },
  { key: "outside_motors", label: "Motor", group: "EXTERIOR", svgPath: "M4 10.5h3V8.5h4l2 2h3.5v5H4zM7 15.5v1.5M17 12.5h2.5" },
  { key: "outside_ruedas", label: "Llantas", group: "EXTERIOR", svgPath: "M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17M12 9a3 3 0 100 6 3 3 0 000-6" },
  { key: "outside_lights", label: "Luces", group: "EXTERIOR", svgPath: "M4 8h5a4 4 0 010 8H4zM14 9.5h5M14 12.5h6M14 15.5h5" },
  { key: "outside_maletero", label: "Maletero", group: "EXTERIOR", svgPath: "M4 9h16v10H4zM9 9V5.5h6V9M9 13h6" },
  { key: "inside_volante", label: "Volante", group: "INTERIOR", svgPath: "M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17M12 9.5a2.5 2.5 0 100 5M12 3.5v6M5 15l4.5-2M19 15l-4.5-2" },
  { key: "inside_tablero", label: "Tablero", group: "INTERIOR", svgPath: "M3 6h18v10H3zM7 16v2M17 16v2M7 10h4M13 10h4" },
  { key: "inside_transmition", label: "Transmisión", group: "INTERIOR", svgPath: "M7 5v14M17 5v14M7 12h10M7 5a1.5 1.5 0 100-3M17 5a1.5 1.5 0 100-3" },
  { key: "inside_asientos", label: "Asientos", group: "INTERIOR", svgPath: "M7 4v9l2 2h7M7 13h8v6M7 19h9" },
  { key: "additional_info", label: "Información", group: "INTERIOR", svgPath: "M12 3a9 9 0 100 18 9 9 0 000-18M12 8v.5M12 11v6" },
  { key: "outside_360_icon", label: "Vista 360°", group: "EXTERIOR", svgPath: "M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 3.5v3M20.5 12h-3M12 20.5v-3M3.5 12h3" },
  { key: "outside_back_lights", label: "Luces traseras", group: "EXTERIOR", svgPath: "M20 8h-5a4 4 0 000 8h5zM10 9.5H5M10 12.5H4M10 15.5H5" },
  { key: "outside_quemacoco", label: "Quemacocos", group: "EXTERIOR", svgPath: "M4 7.5h16v9H4zM7 10h10v4H7z" },
  { key: "outside_suspension", label: "Suspensión", group: "EXTERIOR", svgPath: "M12 3v2L9 7l6 2-6 2 6 2-6 2 3 2v3" },
  { key: "outside_transmition", label: "Transmisión", group: "EXTERIOR", svgPath: "M3 12h4l2-3h6l2 3h4M9 9v6M15 9v6" },
  { key: "outside_wifi", label: "Conectividad", group: "EXTERIOR", svgPath: "M4 10a11 11 0 0116 0M7 13.5a6.5 6.5 0 0110 0M10.5 17a2 2 0 013 0M12 20h.01" },
  { key: "inside_asientos_temperatura", label: "Asientos climatizados", group: "INTERIOR", svgPath: "M6 20v-5a3 3 0 013-3h6a3 3 0 013 3v5M6 20h12M9 4c1 1 1 2 0 3M12 4c1 1 1 2 0 3M15 4c1 1 1 2 0 3" },
  { key: "inside_lights", label: "Luz interior", group: "INTERIOR", svgPath: "M8 4h8l-1 4H9zM6 8h12v2H6zM9 13l1.5 3M15 13l-1.5 3M12 13v3" },
  { key: "inside_wireless", label: "Carga inalámbrica", group: "INTERIOR", svgPath: "M7 20h10a1 1 0 001-1v-1a1 1 0 00-1-1H7a1 1 0 00-1 1v1a1 1 0 001 1zM9 8a3 3 0 016 0M9 11a6 6 0 016 0" },
];

// ——— Puntos de interés genéricos del mock (mismos textos/frames/posiciones;
// las posiciones de interior vienen en píxeles de la panorámica 7096×3548 y
// se normalizan aquí a 0–1, que es lo que guarda la DB — plan §1.5).
const PANO = { width: 7096, height: 3548 };
const POI_EXTERIOR = [
  { icon: "outside_motors", title: "Motor", description: "Información general del motor (contenido placeholder).", frame: 1, image: "/assets/poi/outside_motor.png" },
  { icon: "outside_ruedas", title: "Llantas", description: "Información general de llantas y suspensión (contenido placeholder).", frame: 9, image: "/assets/poi/outside_cauchos.png" },
  { icon: "outside_lights", title: "Luces delanteras", description: "Información general de iluminación (contenido placeholder).", frame: 3, image: "/assets/poi/outside_luces.png" },
  { icon: "outside_maletero", title: "Maletero", description: "Información general del maletero (contenido placeholder).", frame: 19, image: "/assets/poi/outside_maletero.png" },
];
const POI_INTERIOR = [
  { icon: "inside_volante", title: "Volante", description: "Información general del volante (contenido placeholder).", image: "/assets/poi/inside_volante.png", x: 3051, y: 1916 },
  { icon: "inside_tablero", title: "Tablero", description: "Información general del tablero (contenido placeholder).", image: "/assets/poi/inside_tablero.png", x: 3654, y: 1774 },
  { icon: "inside_transmition", title: "Transmisión", description: "Información general de la transmisión (contenido placeholder).", image: "/assets/poi/inside_transmision.png", x: 3495, y: 2484 },
  { icon: "inside_asientos", title: "Asientos", description: "Información general de los asientos (contenido placeholder).", image: "/assets/poi/inside_asientos.png", x: 1668, y: 2129 },
  { icon: "additional_info", title: "Puertas", description: "Información general de las puertas (contenido placeholder).", image: "/assets/poi/inside_puerta.png", x: 781, y: 1845 },
];

const BODY = { Blanco: "#F2F3F5", Negro: "#1B1C1F", Azul: "#2E5FA3", Rojo: "#C22B2B" };
const bodyColorsFrom = (first) => [first, ...Object.keys(BODY).filter((n) => n !== first)];

const ELITE_SPECS = [
  { title: "ESPECIFICACIONES", items: [
    { label: "Potencia", value: "221 hp" },
    { label: "Torque", value: "280 lb-ft" },
    { label: "Motor", value: "2.0L Turbo GDI · 4 cilindros" },
    { label: "Transmisión", value: "Automática de 8 velocidades" },
    { label: "Tren motriz", value: "4×4 · 2H / 4H / 4L" },
    { label: "Carga útil", value: "1,000 kg" },
    { label: "Remolque", value: "750 – 3,500 kg" },
    { label: "Frenos", value: "ABS · EBD · BOS" },
  ] },
];

const VEHICLES = [
  { slug: "elite", commercialName: "ÉLITE", technicalName: "ÉLITE", trimLabel: "Sedán", typeTag: "Sedán · Automático", category: "sedan", order: 0, featureIcons: ["gasoil-car"], colors: bodyColorsFrom("Blanco"), model: "elite", cardImageUrl: "/assets/vehicles/elite.webp", interior: { url: "/assets/interiors/elite-desktop.webp", mobile: "/assets/interiors/elite-mobile.webp", width: 7096, height: 3548 }, specGroups: ELITE_SPECS },
  { slug: "gx7", commercialName: "GX7", technicalName: "GX7", trimLabel: "Sedán", typeTag: "Sedán · Automático", category: "sedan", order: 1, featureIcons: ["gasoil-car"], colors: ["Rojo"], cardImageUrl: "/assets/vehicles/gx7.webp" },
  { slug: "nevado-manual", commercialName: "NEVADO MANUAL", technicalName: "NEVADO MANUAL", trimLabel: "SUV", typeTag: "SUV · Manual", category: "suv", order: 2, featureIcons: ["gasoil-car"], colors: ["Blanco"], cardImageUrl: "/assets/vehicles/nevado-manual.webp" },
  { slug: "tepuy-pro", commercialName: "TEPUY PRO", technicalName: "TEPUY PRO", trimLabel: "SUV", typeTag: "SUV · Automático", category: "suv", order: 3, featureIcons: ["gasoil-car"], colors: ["Blanco"], cardImageUrl: "/assets/vehicles/tepuy-pro.webp" },
  { slug: "savanna", commercialName: "SAVANNA", technicalName: "SAVANNA", trimLabel: "SUV", typeTag: "SUV · Automático", category: "suv", order: 4, featureIcons: ["gasoil-car"], colors: ["Negro"], cardImageUrl: "/assets/vehicles/savanna.webp" },
  { slug: "arena-pro", commercialName: "ARENA PRO", technicalName: "ARENA PRO", trimLabel: "SUV", typeTag: "SUV · Automático", category: "suv", order: 5, featureIcons: ["gasoil-car"], colors: ["Blanco"], cardImageUrl: "/assets/vehicles/arena-pro.webp" },
  { slug: "arena-jac-sport", commercialName: "Arena Jac Sport", technicalName: "Arena Jac Sport", trimLabel: "AT", typeTag: "SUV · AT", category: "suv", order: 6, featureIcons: ["gasoil-car"], colors: ["Negro"], cardImageUrl: "/assets/vehicles/arena-jac-sport.webp" },
  { slug: "la-venezolana-pro", commercialName: "La Venezolana Pro", technicalName: "La Venezolana Pro", trimLabel: "4×4", typeTag: "Pickup · 4×4", category: "pickups", order: 7, featureIcons: ["4x4-car", "gasolina-car"], colors: ["Azul"], cardImageUrl: "/assets/vehicles/la-venezolana-pro.webp" },
  { slug: "sunray-v6-carga", commercialName: "SUNRAY V6 CARGA", technicalName: "SUNRAY V6 CARGA", trimLabel: "Carga", typeTag: "Comercial · Carga", category: "comercial", order: 8, featureIcons: ["gasolina-car"], colors: ["Blanco"], cardImageUrl: "/assets/vehicles/sunray-v6-carga.webp" },
];

const COLOR_SLUGS = { Blanco: "blanco", Negro: "negro", Azul: "azul", Rojo: "rojo" };

async function main() {
  // Íconos del mock, con su archivo real.
  for (const [order, icon] of MOCK_ICONS.entries()) {
    await prisma.hotspotIcon.upsert({
      where: { key: icon.key },
      update: { label: icon.label, group: icon.group, svgPath: icon.svgPath, assetName: icon.key },
      create: { ...icon, assetName: icon.key, order: 100 + order },
    });
  }
  console.log(`Íconos del mock: ${MOCK_ICONS.length}`);

  const categories = Object.fromEntries(
    (await prisma.category.findMany()).map((c) => [c.slug, c.id]),
  );
  const icons = Object.fromEntries(
    (await prisma.hotspotIcon.findMany()).map((i) => [i.key, i.id]),
  );

  for (const v of VEHICLES) {
    const existing = await prisma.vehicle.findUnique({ where: { slug: v.slug } });
    if (existing) {
      console.log(`· ${v.slug} ya existe — sin cambios`);
      continue;
    }

    await prisma.vehicle.create({
      data: {
        slug: v.slug,
        status: "PUBLISHED",
        publishedAt: new Date(),
        commercialName: v.commercialName,
        technicalName: v.technicalName,
        trimLabel: v.trimLabel,
        typeTag: v.typeTag,
        categoryId: categories[v.category],
        order: v.order,
        warrantyLabel: "Garantía de 5 años / 100,000 km",
        cardImageUrl: v.cardImageUrl,
        ownBackgroundUrl: "/assets/backgrounds/light.jpeg",
        interiorPanoramaUrl: v.interior?.url,
        interiorPanoramaMobileUrl: v.interior?.mobile,
        interiorPanoramaWidth: v.interior?.width,
        interiorPanoramaHeight: v.interior?.height,
        featureIcons: {
          create: v.featureIcons.map((key, order) => ({ hotspotIconId: icons[key], order })),
        },
        colors: {
          create: v.colors.map((name, order) => ({
            colorSlug: COLOR_SLUGS[name],
            colorName: name,
            colorHex: BODY[name],
            order,
            // Solo elite tiene sets 360° reales (en /assets/models/elite).
            spriteBasePath: v.model ? `/assets/models/${v.model}/${COLOR_SLUGS[name]}` : null,
            profileImageUrl: v.model
              ? `/assets/models/${v.model}/${COLOR_SLUGS[name]}/low/0025.webp`
              : null,
          })),
        },
        specGroups: {
          create: (v.specGroups ?? [{ title: "ESPECIFICACIONES", items: [] }]).map((g, gOrder) => ({
            title: g.title,
            order: gOrder,
            items: { create: g.items.map((i, iOrder) => ({ ...i, order: iOrder })) },
          })),
        },
        pointsOfInterest: {
          create: [
            ...POI_EXTERIOR.map((p, order) => ({
              mode: "EXTERIOR",
              iconId: icons[p.icon],
              title: p.title,
              description: p.description,
              order,
              frame: p.frame,
              imageUrl: p.image,
            })),
            ...POI_INTERIOR.map((p, order) => ({
              mode: "INTERIOR",
              iconId: icons[p.icon],
              title: p.title,
              description: p.description,
              order,
              imageUrl: p.image,
              textureX: p.x / PANO.width,
              textureY: p.y / PANO.height,
            })),
          ],
        },
      },
    });
    console.log(`✔ ${v.slug} sembrado (PUBLISHED)`);
  }

  // Escenarios globales del mock (los "fondos personalizados" del lápiz),
  // habilitados para todos los vehículos sembrados — mismo comportamiento.
  const MOCK_SCENARIOS = [
    { label: "Médanos de Coro", imageUrl: "/assets/backgrounds/medanos-de-coro.webp" },
    { label: "El camino de la felicidad", imageUrl: "/assets/backgrounds/camino-de-la-felicidad.png" },
  ];
  for (const s of MOCK_SCENARIOS) {
    let scenario = await prisma.scenario.findFirst({ where: { label: s.label } });
    if (!scenario) scenario = await prisma.scenario.create({ data: s });
    const vehicles = await prisma.vehicle.findMany({ where: { status: "PUBLISHED" } });
    for (const vehicle of vehicles) {
      await prisma.vehicleScenario.upsert({
        where: { vehicleId_scenarioId: { vehicleId: vehicle.id, scenarioId: scenario.id } },
        update: {},
        create: { vehicleId: vehicle.id, scenarioId: scenario.id, enabled: true },
      });
    }
  }
  console.log("Escenarios del mock vinculados");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
