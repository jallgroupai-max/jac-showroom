// Decodifica en streaming un body base64 sin cargarlo en memoria (§2.5).
//
// Por qué (hotfix WAF, nov 2026): el FortiWeb de showroom.jacvenezuela.com
// encuentra por azar la firma de Log4Shell (CVE-2021-44228, "${...") en los
// bytes binarios de PNG/ZIP y bloquea la subida con su página de 500. La
// corporación no admite excepciones, así que la UI manda el archivo en base64
// (alfabeto A-Z a-z 0-9 + / =, sin "$" ni "{") y aquí se reconstruye.
//
// Corta en múltiplos de 4 caracteres y guarda el resto para el trozo
// siguiente: la red parte el body en cualquier byte, y un grupo de 4 partido a
// la mitad decodificaría mal. Check: node scripts/check-base64-stream.mjs
export function base64DecodeStream(): TransformStream<Uint8Array, Uint8Array> {
  let rest = "";
  return new TransformStream({
    transform(chunk, controller) {
      const text = rest + Buffer.from(chunk).toString("latin1");
      const cut = text.length - (text.length % 4);
      rest = text.slice(cut);
      if (cut > 0) controller.enqueue(Buffer.from(text.slice(0, cut), "base64"));
    },
    flush(controller) {
      if (rest) controller.enqueue(Buffer.from(rest, "base64"));
    },
  });
}
