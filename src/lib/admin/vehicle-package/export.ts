import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import yazl from "yazl";
import { prisma } from "@/lib/prisma";
import { readUpload, uploadExists } from "@/lib/storage";
import { mapPool } from "./pool";
import { FRAME_COUNT, PACKAGE_FORMAT, PACKAGE_VERSION, MANIFEST_NAME, type Manifest } from "./format";

// Exportación de un vehículo completo a .zip (formato en ./format.ts).
// El zip se ARMA EN STREAMING: vehicle.json va en memoria (unos KB) y cada
// imagen se lee de storage y se escribe al zip en el momento en que le toca
// (addReadStreamLazy) — nunca hay más de un archivo abierto ni el zip entero
// en RAM. Las imágenes ya están comprimidas (WebP): van con STORE.

type Asset = { zipPath: string; url: string };

const pad = (n: number, width: number) => String(n).padStart(width, "0");

// Un asset del vehículo vive en uno de dos sitios: "/uploads/…" (storage del
// panel: disco o bucket) o "/assets/…" (public/ — lo que dejó el seed del
// showroom; también se puede exportar, para poder mover esos vehículos).
const PUBLIC_DIR = path.join(process.cwd(), "public");

function staticPath(url: string): string | null {
  if (!url.startsWith("/assets/")) return null;
  const rel = path.posix.normalize(url.slice(1));
  return rel.startsWith("..") ? null : path.join(PUBLIC_DIR, rel);
}

function uploadKey(url: string): string | null {
  return url.startsWith("/uploads/") ? url.slice("/uploads/".length) : null;
}

async function urlExists(url: string): Promise<boolean> {
  const file = staticPath(url);
  if (file) return stat(file).then((info) => info.isFile(), () => false);
  const key = uploadKey(url);
  return key ? uploadExists(key) : false;
}

async function urlStream(url: string): Promise<Readable | null> {
  const file = staticPath(url);
  if (file) return createReadStream(file);
  const key = uploadKey(url);
  const asset = key ? await readUpload(key) : null;
  return asset ? Readable.fromWeb(asset.stream as import("node:stream/web").ReadableStream) : null;
}

function extOf(url: string): string {
  const ext = path.extname(url).toLowerCase();
  return [".webp", ".png", ".jpg", ".jpeg"].includes(ext) ? ext : ".webp";
}

export type PreparedExport = { slug: string; manifest: Manifest; assets: Asset[] };

/** Lee el vehículo, resuelve sus archivos y arma el manifiesto. null = no existe. */
export async function prepareVehicleExport(vehicleId: string): Promise<PreparedExport | null> {
  const v = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      category: true,
      featureIcons: { orderBy: { order: "asc" }, include: { hotspotIcon: true } },
      colors: { orderBy: { order: "asc" } },
      specGroups: { orderBy: { order: "asc" }, include: { items: { orderBy: { order: "asc" } } } },
      pointsOfInterest: { orderBy: [{ mode: "asc" }, { order: "asc" }], include: { icon: true } },
      scenarios: { include: { scenario: true } },
      viewerPositions: true,
    },
  });
  if (!v || v.status === "ARCHIVED") return null;

  // — 1) Candidatos: (zipPath → URL pública). Aún no se sabe cuáles existen.
  const candidates = new Map<string, string>();
  const want = (publicUrl: string, zipPath: string): string => {
    candidates.set(zipPath, publicUrl);
    return zipPath;
  };

  const colorFrames = v.colors.map((c) => {
    const base = c.spriteBasePath;
    if (!base) return null;
    // "high" = la mejor calidad que conserva el servidor (el original se
    // borra al terminar el job). Convención del estándar: 001..036.
    return Array.from({ length: FRAME_COUNT }, (_, i) => {
      const zipPath = `colors/${c.colorSlug}/${pad(i + 1, 3)}.webp`;
      candidates.set(zipPath, `${base}/high/${pad(i + 1, 4)}.webp`);
      return zipPath;
    });
  });

  const poiCount = { EXTERIOR: 0, INTERIOR: 0 };
  const poiRefs = v.pointsOfInterest.map((p) => {
    const n = pad(++poiCount[p.mode], 2);
    const prefix = `poi/${p.mode === "EXTERIOR" ? "exterior" : "interior"}-${n}`;
    return {
      image: p.imageUrl ? want(p.imageUrl, `${prefix}${extOf(p.imageUrl)}`) : null,
      imageMobile: p.imageMobileUrl ? want(p.imageMobileUrl, `${prefix}-mobile${extOf(p.imageMobileUrl)}`) : null,
    };
  });
  const panoramaRef = v.interiorPanoramaUrl ? want(v.interiorPanoramaUrl, `interior/panorama${extOf(v.interiorPanoramaUrl)}`) : null;
  const cardRef = v.cardImageUrl ? want(v.cardImageUrl, `card/image${extOf(v.cardImageUrl)}`) : null;
  const backgroundRef = v.ownBackgroundUrl ? want(v.ownBackgroundUrl, `background/own${extOf(v.ownBackgroundUrl)}`) : null;

  // — 2) Existencia real: un archivo borrado a mano del bucket no debe romper
  //   el zip a la mitad de la descarga (ya habría empezado a enviarse).
  const entries = [...candidates];
  const exists = await mapPool(entries, 8, ([, url]) => urlExists(url));
  const present = new Set(entries.filter((_, i) => exists[i]).map(([zipPath]) => zipPath));
  const warnings: string[] = [];
  const ok = (ref: string | null, what: string) => {
    if (!ref) return null;
    if (present.has(ref)) return ref;
    warnings.push(`Falta en storage: ${what}`);
    return null;
  };

  const manifest: Manifest = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    vehicle: {
      commercialName: v.commercialName,
      technicalName: v.technicalName,
      trimLabel: v.trimLabel,
      slug: v.slug,
      typeTag: v.typeTag,
      warrantyLabel: v.warrantyLabel,
      category: v.category.slug,
      featureIcons: v.featureIcons.map((f) => f.hotspotIcon.key),
    },
    specGroups: v.specGroups.map((g) => ({
      title: g.title,
      items: g.items.map((i) => ({ label: i.label, value: i.value })),
    })),
    colors: v.colors.map((c, i) => {
      const frames = colorFrames[i];
      const complete = frames?.every((f) => present.has(f)) ?? false;
      if (frames && !complete) warnings.push(`Color "${c.colorName}": faltan fotogramas en storage; se exporta sin galería`);
      return {
        slug: c.colorSlug,
        name: c.colorName,
        hex: c.colorHex,
        order: c.order,
        frameCount: c.frameCount,
        frames: complete ? frames : null,
      };
    }),
    pointsOfInterest: v.pointsOfInterest.map((p, i) => ({
      mode: p.mode,
      icon: p.icon.key,
      title: p.title,
      description: p.description,
      order: p.order,
      iconSize: p.iconSize,
      blink: p.blink,
      frame: p.frame,
      textureX: p.textureX,
      textureY: p.textureY,
      image: ok(poiRefs[i].image, `imagen del punto "${p.title}"`),
      imageMobile: ok(poiRefs[i].imageMobile, `imagen mobile del punto "${p.title}"`),
    })),
    interiorPanorama: ok(panoramaRef, "panorámica interior"),
    images: { card: ok(cardRef, "imagen de la card"), ownBackground: ok(backgroundRef, "fondo propio") },
    viewerPositions: v.viewerPositions.map((p) => ({
      preset: p.preset,
      offsetX: p.offsetX,
      offsetY: p.offsetY,
      scale: p.scale,
    })),
    scenarios: [...v.scenarios]
      .sort((a, b) => a.scenario.order - b.scenario.order)
      .map((s) => ({ label: s.scenario.label, enabled: s.enabled })),
  };
  if (warnings.length) manifest.warnings = warnings;

  // Solo lo que el manifiesto realmente referencia entra al zip.
  const referenced = new Set<string>();
  for (const c of manifest.colors) for (const f of c.frames ?? []) referenced.add(f);
  for (const p of manifest.pointsOfInterest) for (const r of [p.image, p.imageMobile]) if (r) referenced.add(r);
  for (const r of [manifest.interiorPanorama, manifest.images.card, manifest.images.ownBackground]) if (r) referenced.add(r);
  const assets = [...referenced].map((zipPath) => ({ zipPath, url: candidates.get(zipPath) as string }));

  return { slug: v.slug, manifest, assets };
}

/** Stream del .zip. Un error de storage a media descarga destruye el stream
 * (el navegador ve la descarga fallida en lugar de un zip truncado "válido"). */
export function vehicleZipStream({ manifest, assets }: PreparedExport): Readable {
  const zip = new yazl.ZipFile();
  const out = zip.outputStream as Readable;
  zip.on("error", (error: Error) => out.destroy(error));

  zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), MANIFEST_NAME);
  for (const { zipPath, url } of assets) {
    zip.addReadStreamLazy(zipPath, { compress: false }, (cb) => {
      urlStream(url)
        .then((stream) =>
          stream ? cb(null, stream) : cb(new Error(`El archivo ${url} desapareció del storage durante la exportación`), null as never),
        )
        .catch((error) => cb(error, null as never));
    });
  }
  zip.end();
  return out;
}
