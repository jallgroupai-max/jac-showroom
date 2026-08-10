// Seed de la Fase A0: primer usuario del panel, concesionario y categorías.
// Idempotente (upsert) — correrlo dos veces no duplica nada.
// La conversión completa de mock-data.ts (vehículos, colores, POIs) llega en
// la Fase A5 del plan; aquí solo va lo estable que A1 necesita para arrancar.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Mismas categorías (y mismos slugs) que usa hoy mock-data.ts — el orden es
// el de las tabs del catálogo público.
const CATEGORIES = [
  { slug: "pickups", name: "Pickups", order: 0 },
  { slug: "sedan", name: "Sedán", order: 1 },
  { slug: "suv", name: "SUV", order: 2 },
  { slug: "comercial", name: "Comercial", order: 3 },
];

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@jac.com.ve").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? "Administrador";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("SEED_ADMIN_PASSWORD no está definido en .env — no se crea un usuario con contraseña por defecto.");
  }

  const passwordHash = await hash(password);
  await prisma.adminUser.upsert({
    where: { email },
    // Si el usuario ya existe no se le pisa la contraseña: el seed debe poder
    // correrse en cualquier momento sin resetear credenciales en uso.
    update: {},
    create: { email, name, passwordHash },
  });
  console.log(`AdminUser listo: ${email}`);

  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, order: c.order },
      create: c,
    });
  }
  console.log(`Categorías: ${CATEGORIES.map((c) => c.slug).join(", ")}`);

  // Hoy hardcodeado en el showroom; entidad modelada desde ya (TRD §5).
  const dealer = await prisma.dealer.findFirst({ where: { city: "Barquisimeto" } });
  if (!dealer) {
    await prisma.dealer.create({ data: { city: "Barquisimeto", active: true } });
  }
  console.log("Dealer listo: Barquisimeto");

  for (const [order, icon] of HOTSPOT_ICONS.entries()) {
    await prisma.hotspotIcon.upsert({
      where: { key: icon.key },
      update: {
        label: icon.label,
        group: icon.group,
        svgPath: icon.svgPath,
        assetName: icon.assetName,
        order,
      },
      create: { ...icon, order },
    });
  }
  console.log(`Íconos de hotspot: ${HOTSPOT_ICONS.length}`);
}

// Catálogo inicial de íconos (plan §1.2: un catálogo, dos usos). Los paths
// 24×24 son SOLO para el picker del panel; el showroom público usa SIEMPRE
// el SVG real de recursos/Iconos vía assetName — sus componentes UI/UX son
// intocables (regla no negociable) y deben renderizar los mismos archivos
// validados pixel a pixel.
// MISMAS claves que seed-catalog.mjs (MOCK_ICONS) — ambos seeds upsertean por
// key: si las claves divergieran, correr los dos duplicaría el catálogo del
// picker (bug real: existían "motor" y "outside_motors" a la vez).
const HOTSPOT_ICONS = [
  { key: "outside_motors", label: "Motor", group: "EXTERIOR", assetName: "outside_motors", svgPath: "M4 10.5h3V8.5h4l2 2h3.5v5H4zM7 15.5v1.5M17 12.5h2.5" },
  { key: "outside_ruedas", label: "Llantas", group: "EXTERIOR", assetName: "outside_ruedas", svgPath: "M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17M12 9a3 3 0 100 6 3 3 0 000-6" },
  { key: "outside_lights", label: "Luces", group: "EXTERIOR", assetName: "outside_lights", svgPath: "M4 8h5a4 4 0 010 8H4zM14 9.5h5M14 12.5h6M14 15.5h5" },
  { key: "outside_maletero", label: "Maletero", group: "EXTERIOR", assetName: "outside_maletero", svgPath: "M4 9h16v10H4zM9 9V5.5h6V9M9 13h6" },
  { key: "inside_volante", label: "Volante", group: "INTERIOR", assetName: "inside_volante", svgPath: "M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5M12 3.5v6M5 15l4.5-2M19 15l-4.5-2" },
  { key: "clima", label: "Clima", group: "INTERIOR", assetName: "inside_temparetaure", svgPath: "M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" },
  { key: "audio", label: "Audio", group: "INTERIOR", assetName: "connectivity", svgPath: "M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9.5a4 4 0 010 5" },
  { key: "techo", label: "Techo", group: "INTERIOR", assetName: "inside_quemacoco", svgPath: "M4 7.5h16v9H4zM7 10h10v4H7z" },
  { key: "diesel-car", label: "Diésel", group: "GENERAL", assetName: "diesel-car", svgPath: "M6 20V6a2 2 0 012-2h6a2 2 0 012 2v14M6 20h10M6 11h10M16 8l3 3v6a1.5 1.5 0 01-3 0" },
  { key: "gasoil-car", label: "Gasoil", group: "GENERAL", assetName: "gasoil-car", svgPath: "M7 20V5.5a1.5 1.5 0 011.5-1.5h5A1.5 1.5 0 0115 5.5V20M5 20h12M9.5 7.5h3.5" },
  { key: "electric-car", label: "Eléctrico", group: "GENERAL", assetName: "electric-car", svgPath: "M13 3L5 13.5h5L9.5 21l8-10.5h-5z" },
  { key: "4x4-car", label: "4×4", group: "GENERAL", assetName: "4x4-car", svgPath: "M2 16h20M4 16v-4h5l2-3h4l2 3h3v4M7.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3M16.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3" },
];

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
