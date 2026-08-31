// Saneador de los SVG que el panel sube como ícono de categoría.
//
// Por qué existe: un SVG NO es una imagen inerte — es un documento XML que
// admite <script>, atributos on*, javascript: en href y <use>/<image> hacia
// recursos externos. Como /uploads/* se sirve desde el MISMO origen que el
// panel, abrir un SVG malicioso en una pestaña ejecutaría su script con la
// sesión del admin. Se limpia al subir (aquí) y además se sirve con una CSP
// de bloqueo total (src/app/uploads/[...path]/route.ts) — defensa en dos
// capas, porque cualquiera de las dos sola es un único punto de fallo.
//
// Todas las expresiones son literales de regex, nunca cadenas pasadas a
// `new RegExp`: en un template literal `\b` es el carácter de retroceso y
// `\s` degenera en `s`, y una regex así falla en silencio — deja pasar
// justamente lo que venía a bloquear.

/** Elementos que jamás tienen sentido en un ícono y sí son vector de ataque. */
const FORBIDDEN_ELEMENTS =
  /script|foreignObject|iframe|embed|object|audio|video|animate|set|handler/
    .source;

// Con contenido (<script>…</script>) y en forma vacía (<script/>, <script>).
// La retro-referencia cierra con la MISMA etiqueta que abrió.
const FORBIDDEN_PAIR = new RegExp(`<(${FORBIDDEN_ELEMENTS})\\b[\\s\\S]*?</\\1\\s*>`, "gi");
const FORBIDDEN_SINGLE = new RegExp(`<(${FORBIDDEN_ELEMENTS})\\b[^>]*>`, "gi");

// DOCTYPE, incluido el subconjunto interno `[ <!ENTITY …> ]` — vector de XXE.
// Sin contemplar los corchetes, el `>` de la primera entidad cortaría el
// match y dejaría el resto del subconjunto en el archivo.
const DOCTYPE = /<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?[^>]*>/gi;

const XML_PROLOG = /<\?xml[\s\S]*?\?>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const EVENT_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const URL_ATTR = /\s(?:xlink:href|href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const EXECUTABLE_SCHEME = /(?:javascript|vbscript|data:text\/html)\s*:/gi;
const CSS_IMPORT = /@import[^;]*;?/gi;

/** Referencias que sí se conservan: internas al propio documento e imágenes
 * embebidas. Nada que salga a la red ni que ejecute código. */
const SAFE_URL = /^(?:#|data:image\/(?:png|jpeg|webp|gif);base64,)/i;

export type SvgSanitizeResult = { ok: true; svg: string } | { ok: false; error: string };

export function sanitizeSvg(source: string): SvgSanitizeResult {
  let svg = source.replace(/^﻿/, "").trim();

  // Debe ser un SVG de verdad, no un HTML/XML cualquiera renombrado.
  if (!/<svg[\s>]/i.test(svg)) {
    return { ok: false, error: "El archivo no es un SVG válido." };
  }

  svg = svg.replace(XML_PROLOG, "").replace(DOCTYPE, "").replace(COMMENT, "");

  // Hasta punto fijo: quitar un elemento puede destapar otro que estaba
  // partido a propósito (`<scr<script>ipt>` vuelve a formar `<script>` en
  // cuanto se elimina el interior). Una sola pasada no bastaría.
  for (let pass = 0; pass < 8; pass++) {
    const before = svg;
    svg = svg.replace(FORBIDDEN_PAIR, "").replace(FORBIDDEN_SINGLE, "");
    if (svg === before) break;
  }

  // Manejadores de evento (onload, onclick, onmouseover…) en cualquier forma
  // de comillas.
  svg = svg.replace(EVENT_ATTR, "");

  svg = svg.replace(URL_ATTR, (match, dq, sq, bare) => {
    const value = String(dq ?? sq ?? bare ?? "").trim();
    return SAFE_URL.test(value) ? match : "";
  });

  // url(javascript:…) y demás dentro de atributos de estilo/presentación.
  svg = svg.replace(EXECUTABLE_SCHEME, "");

  // <style> se conserva: un ícono puede traer CSS legítimo y, sin script ni
  // URLs externas, lo único que puede hacer es pintar. Lo que sí se corta son
  // los @import, que volverían a abrir la puerta a la red.
  svg = svg.replace(CSS_IMPORT, "");

  svg = svg.trim();
  if (svg.length === 0 || !/<svg[\s>]/i.test(svg)) {
    return { ok: false, error: "El SVG quedó vacío tras la limpieza." };
  }
  return { ok: true, svg };
}
