// Check de src/lib/base64-stream.ts: base64 partido en trozos arbitrarios
// (como llega por la red) debe reconstruir los bytes exactos.
// Uso: node scripts/check-base64-stream.mjs   (Node >= 23.6, importa .ts)
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { base64DecodeStream } from "../src/lib/base64-stream.ts";

for (const size of [0, 1, 2, 3, 4, 5, 1000, 3 * 1024 * 1024 + 7]) {
  const original = randomBytes(size);
  // Mismo armado que toBase64Blob en step3-gallery.tsx: trozos múltiplos de 3.
  const CHUNK = 3 * 1024;
  let encoded = "";
  for (let i = 0; i < size; i += CHUNK) encoded += original.subarray(i, i + CHUNK).toString("base64");
  const bytes = Buffer.from(encoded, "latin1");

  const input = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; ) {
        const step = 1 + Math.floor(Math.random() * 9000);
        controller.enqueue(bytes.subarray(i, i + step));
        i += step;
      }
      controller.close();
    },
  });
  const out = [];
  for await (const part of input.pipeThrough(base64DecodeStream())) out.push(part);
  assert.deepEqual(Buffer.concat(out), original, `size ${size}`);
  assert.ok(!encoded.includes("${"), "base64 nunca contiene ${");
}
console.log("ok: base64DecodeStream reconstruye los bytes exactos");
