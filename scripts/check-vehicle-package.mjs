// Check de src/lib/admin/vehicle-package/format.ts: manifiesto (zod), rutas
// seguras, límites anti zip-bomb y round-trip real zip (yazl → unzipper).
// Uso: node scripts/check-vehicle-package.mjs   (Node >= 23.6, importa .ts)
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";
import unzipper from "unzipper";
import {
  FRAME_COUNT,
  IMPORT_LIMITS,
  VIEWER_RANGES,
  indexZipEntries,
  manifestSchema,
  referencedPaths,
  safeEntryPath,
} from "../src/lib/admin/vehicle-package/format.ts";
import { VIEWER_PRESETS, VIEWER_LIMITS } from "../src/lib/viewer-position.ts";

// — Paridad con viewer-position.ts (los literales de format.ts son espejo).
for (const key of Object.keys(VIEWER_LIMITS)) {
  assert.equal(VIEWER_RANGES[key].min, VIEWER_LIMITS[key].min, `rango ${key}.min diverge de viewer-position.ts`);
  assert.equal(VIEWER_RANGES[key].max, VIEWER_LIMITS[key].max, `rango ${key}.max diverge de viewer-position.ts`);
}
const sample = (preset) => ({ preset, offsetX: 0, offsetY: 0.1, scale: 1 });

// — Manifiesto válido de ejemplo.
const frames = Array.from({ length: FRAME_COUNT }, (_, i) => `colors/blanco/${String(i + 1).padStart(3, "0")}.webp`);
const manifest = () => ({
  format: "jac-vehicle",
  version: 1,
  vehicle: {
    commercialName: "Aventura 4X4",
    technicalName: "Frison T9 4X4",
    trimLabel: "Gasolina Automática",
    slug: "aventura-4x4",
    typeTag: "SUV · Automático",
    warrantyLabel: "5 años",
    category: "suv",
    featureIcons: ["gasolina", "4x4"],
  },
  specGroups: [{ title: "Motor", items: [{ label: "Potencia", value: "150 hp" }] }],
  colors: [{ slug: "blanco", name: "Blanco Perla", hex: "#F2F3F5", order: 0, frameCount: 36, frames }],
  pointsOfInterest: [
    { mode: "EXTERIOR", icon: "motor", title: "Motor", description: "", order: 0, iconSize: 100, blink: "SOFT", frame: 5, textureX: null, textureY: null, image: "poi/exterior-01.webp", imageMobile: "poi/exterior-01-mobile.webp" },
    { mode: "INTERIOR", icon: "pantalla", title: "Pantalla", description: "", order: 0, iconSize: 100, blink: "FAST", frame: null, textureX: 0.4, textureY: 0.6, image: null, imageMobile: null },
  ],
  interiorPanorama: "interior/panorama.webp",
  images: { card: "card/image.webp", ownBackground: null },
  viewerPositions: VIEWER_PRESETS.map(sample),
  scenarios: [{ label: "Estudio", enabled: true }],
});

assert.ok(manifestSchema.safeParse(manifest()).success, "manifiesto válido debe parsear");
assert.equal(referencedPaths(manifestSchema.parse(manifest())).length, FRAME_COUNT + 4);

const rejects = (mutate, why) => {
  const m = manifest();
  mutate(m);
  assert.ok(!manifestSchema.safeParse(m).success, `debe rechazar: ${why}`);
};
rejects((m) => (m.version = 2), "versión desconocida");
rejects((m) => (m.format = "otro"), "formato distinto");
rejects((m) => (m.images.card = "../../etc/passwd.png"), "path traversal en imagen");
rejects((m) => (m.images.card = "/abs/card.webp"), "ruta absoluta");
rejects((m) => (m.images.card = "C:/card.webp"), "letra de unidad");
rejects((m) => (m.images.card = "card/image.svg"), "extensión no imagen");
rejects((m) => (m.colors[0].frames = frames.slice(1)), "35 fotogramas");
rejects((m) => (m.colors[0].hex = "blanco"), "hex inválido");
rejects((m) => m.colors.push({ ...m.colors[0] }), "color repetido");
rejects((m) => (m.pointsOfInterest[1].textureX = null), "POI interior sin posición");
rejects((m) => (m.viewerPositions[0].scale = 99), "scale fuera de rango");
rejects((m) => m.viewerPositions.push(sample("TABLET")), "preset repetido");
rejects((m) => (m.vehicle.slug = "Con Espacios"), "slug inválido");
rejects((m) => delete m.vehicle.category, "sin categoría");

// — safeEntryPath.
for (const [raw, expected] of [
  ["vehicle.json", "vehicle.json"],
  ["colors\\blanco\\001.webp", "colors/blanco/001.webp"],
  ["./a//b.png", "a/b.png"],
  ["../x", null],
  ["a/../../x", null],
  ["/etc/passwd", null],
  ["\\\\server\\share", null],
  ["C:\\x.png", null],
  ["a\0b", null],
  ["", null],
]) {
  assert.equal(safeEntryPath(raw), expected, `safeEntryPath(${JSON.stringify(raw)})`);
}

// — indexZipEntries: límites y rutas hostiles.
const file = (p, size = 10) => ({ path: p, type: "File", size });
assert.throws(() => indexZipEntries([file("../evil.png")]), /ruta no permitida/);
assert.throws(() => indexZipEntries([file("a/b.png"), file("a\\b.png")]), /repite/);
assert.throws(() => indexZipEntries(Array.from({ length: 6 }, (_, i) => file(`f${i}`)), { ...IMPORT_LIMITS, maxEntries: 5 }), /demasiadas entradas/);
assert.throws(() => indexZipEntries([file("a", 600), file("b", 600)], { ...IMPORT_LIMITS, maxTotalBytes: 1000 }), /pesaría más/);
const ok = indexZipEntries([
  file("vehicle.json"),
  file("__MACOSX/._x"),
  file("colors/.DS_Store"),
  { path: "colors/", type: "Directory", size: 0 },
  file("colors/blanco/001.webp"),
]);
assert.deepEqual([...ok.keys()], ["vehicle.json", "colors/blanco/001.webp"]);

// — Round-trip real: yazl (STORE para imágenes, deflate para json) → unzipper.
const dir = await mkdtemp(path.join(tmpdir(), "jac-pkg-check-"));
try {
  const png = Buffer.concat([Buffer.from("${jndi:ldap://x}"), Buffer.alloc(5000, 7)]); // bytes "WAF-hostiles" a propósito
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(manifest())), "vehicle.json");
  zip.addReadStreamLazy("colors/blanco/001.webp", { compress: false }, (cb) => {
    cb(null, Readable.from([png]));
  });
  zip.end();
  const zipPath = path.join(dir, "pkg.zip");
  await pipeline(zip.outputStream, createWriteStream(zipPath));

  const directory = await unzipper.Open.file(zipPath);
  const index = indexZipEntries(directory.files.map((f) => ({ path: f.path, type: f.type, size: f.uncompressedSize, f })));
  assert.deepEqual([...index.keys()].sort(), ["colors/blanco/001.webp", "vehicle.json"]);
  assert.deepEqual(await index.get("colors/blanco/001.webp").f.buffer(), png, "bytes idénticos tras STORE");
  assert.ok(manifestSchema.safeParse(JSON.parse((await index.get("vehicle.json").f.buffer()).toString())).success);
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("ok: vehicle-package (manifiesto, rutas seguras, límites zip-bomb, round-trip zip)");
