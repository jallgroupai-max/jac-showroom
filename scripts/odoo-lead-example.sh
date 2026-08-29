#!/usr/bin/env bash
# Ejemplos de registro de un lead — las dos capas por separado.
#
#   ./odoo-lead-example.sh api     -> POST a nuestro /api/leads (camino real del showroom)
#   ./odoo-lead-example.sh odoo    -> JSON-RPC directo a Odoo (lo que hace src/lib/crm.ts por dentro)
#   ./odoo-lead-example.sh payload -> solo imprime el JSON, sin enviar nada
#
# Las credenciales salen del .env del proyecto:
#   set -a; . .env; set +a; ./scripts/odoo-lead-example.sh odoo
#
# CUIDADO: `api` y `odoo` CREAN REGISTROS REALES. Los datos de ejemplo llevan
# el prefijo "PRUEBA TECNICA" justamente para que se puedan identificar y
# borrar después desde el CRM.
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
ODOO_URL="${ODOO_URL:-https://odoo.bel.com.ve}"
ODOO_DB="${ODOO_DB:-bel_odoo}"
ODOO_USER="${ODOO_USER:-showroom}"

# Datos del comprador de prueba. Cambiar el teléfono/correo entre corridas para
# ejercitar la creación de contacto; repetirlos ejercita el dedupe.
NOMBRE="PRUEBA TECNICA - Juan Perez"
TELEFONO="+58 412 0123456"
CORREO="prueba.tecnica@example.com"

# ─────────────────────────────────────────────────────────────────────────────
# 1) Camino real: el formulario "Me interesa este vehículo" -> POST /api/leads
#
# Este es el payload EXACTO que arma src/components/showroom/lead-form.tsx.
# El backend persiste el lead en Postgres y recién después llama a Odoo, así
# que responde 200 aunque el CRM esté caído (el lead queda reintentable en
# /admin/leads). `syncedToOdoo` en la respuesta dice si el envío al CRM salió.
#
# Notas:
#   - `dealerId` debe existir; si no, route.ts cae al primer concesionario
#     activo, así que para probar sirve cualquier string no vacío.
#   - `website` es el honeypot anti-spam: si va con contenido, el endpoint
#     responde éxito y NO guarda nada. Dejarlo vacío.
#   - Hay rate limit de 5 envíos por IP cada 10 minutos (429 al pasarse).
# ─────────────────────────────────────────────────────────────────────────────
payload() {
  cat <<EOF
{
  "website": "",
  "fullName": "$NOMBRE",
  "phone": "$TELEFONO",
  "email": "$CORREO",
  "dealerId": "cualquiera-cae-al-primero-activo",
  "contactChannel": "whatsapp",
  "wantsTestDrive": true,
  "vehicleSlug": "aventura-4x4",
  "vehicleCommercialName": "Aventura 4X4",
  "vehicleTechnicalName": "Frison T9 4X4",
  "variantColorName": "Blanco Perlado",
  "origin": "desktop"
}
EOF
}

modo_api() {
  echo "POST $APP_URL/api/leads"
  payload | curl -sS -X POST "$APP_URL/api/leads" \
    -H "Content-Type: application/json" \
    --data-binary @- \
    -w '\nHTTP %{http_code}\n'
  echo
  echo "syncedToOdoo:true  -> la oportunidad se creó en el CRM."
  echo "syncedToOdoo:false -> el lead SÍ quedó en Postgres; reintentar desde /admin/leads."
}

# ─────────────────────────────────────────────────────────────────────────────
# 2) JSON-RPC directo a Odoo — los tres pasos que ejecuta src/lib/crm.ts.
#    Útil para depurar sin levantar Next.
# ─────────────────────────────────────────────────────────────────────────────
rpc() { curl -sS --max-time 30 "$ODOO_URL/jsonrpc" -H "Content-Type: application/json" -d "$1"; }

modo_odoo() {
  : "${ODOO_API_KEY:?falta ODOO_API_KEY — exportala, no la escribas en este archivo}"

  # Paso 1 — autenticar. Devuelve el uid, o false si las credenciales fallan.
  echo "[1/3] authenticate"
  local auth uid
  auth=$(rpc "{\"jsonrpc\":\"2.0\",\"method\":\"call\",\"params\":{\"service\":\"common\",
    \"method\":\"authenticate\",\"args\":[\"$ODOO_DB\",\"$ODOO_USER\",\"$ODOO_API_KEY\",{}]},\"id\":1}")
  uid=$(sed -n 's/.*"result": *\([0-9]*\).*/\1/p' <<<"$auth")
  [ -n "$uid" ] || { echo "  auth falló: $auth" >&2; exit 1; }
  echo "  uid=$uid"

  # Teléfono normalizado igual que normalizePhone() en crm.ts: sin espacios ni
  # guiones, sin el 0 local, pegado al +58. El dedupe depende de este formato.
  local tel
  tel="+58$(echo "$TELEFONO" | tr -cd '0-9' | sed 's/^58//; s/^0*//')"
  echo "  telefono normalizado: $tel"

  # Paso 2 — buscar el contacto por teléfono o correo; crearlo si no existe.
  echo "[2/3] res.partner"
  local dom found pid
  dom="[\"|\",\"|\",[\"phone\",\"=\",\"$tel\"],[\"mobile\",\"=\",\"$tel\"],[\"email\",\"=ilike\",\"$CORREO\"]]"
  found=$(rpc "{\"jsonrpc\":\"2.0\",\"method\":\"call\",\"params\":{\"service\":\"object\",
    \"method\":\"execute\",\"args\":[\"$ODOO_DB\",$uid,\"$ODOO_API_KEY\",\"res.partner\",
    \"search_read\",$dom,[\"id\",\"name\"]]},\"id\":1}")
  pid=$(sed -n 's/.*"id": \([0-9]*\), "name".*/\1/p' <<<"$found" | head -1)

  if [ -n "$pid" ]; then
    echo "  contacto existente reutilizado: id=$pid"
  else
    pid=$(rpc "{\"jsonrpc\":\"2.0\",\"method\":\"call\",\"params\":{\"service\":\"object\",
      \"method\":\"execute\",\"args\":[\"$ODOO_DB\",$uid,\"$ODOO_API_KEY\",\"res.partner\",\"create\",
      {\"name\":\"$NOMBRE\",\"phone\":\"$tel\",\"email\":\"$CORREO\",
       \"company_type\":\"person\",\"city\":\"Barquisimeto\"}]},\"id\":1}" \
      | sed -n 's/.*"result": *\([0-9]*\).*/\1/p')
    [ -n "$pid" ] || { echo "  no se pudo crear el contacto" >&2; exit 1; }
    echo "  contacto creado: id=$pid"
  fi

  # Paso 3 — crear la oportunidad. Siempre nueva, aunque el contacto ya existiera.
  # `name` y `type` son los dos únicos campos obligatorios de crm.lead.
  # `description` es HTML: los saltos de línea van con <br>, no con \n.
  echo "[3/3] crm.lead"
  local desc lead
  desc="<p><b>Vehículo:</b> Aventura 4X4 (Frison T9 4X4)<br><b>Color:</b> Blanco Perlado<br><b>Test drive:</b> Sí, lo solicita<br><b>Canal preferido:</b> WhatsApp<br><b>Concesionario:</b> Barquisimeto<br><b>Origen:</b> Escritorio<br><b>Referencia:</b> aventura-4x4</p>"
  lead=$(rpc "{\"jsonrpc\":\"2.0\",\"method\":\"call\",\"params\":{\"service\":\"object\",
    \"method\":\"execute\",\"args\":[\"$ODOO_DB\",$uid,\"$ODOO_API_KEY\",\"crm.lead\",\"create\",
    {\"name\":\"Showroom 360 - Aventura 4X4 - $NOMBRE\",
     \"type\":\"opportunity\",
     \"partner_id\":$pid,
     \"contact_name\":\"$NOMBRE\",
     \"phone\":\"$tel\",
     \"email_from\":\"$CORREO\",
     \"company_type\":\"person\",
     \"city\":\"Barquisimeto\",
     \"description\":\"$desc\"}]},\"id\":1}")
  echo "  $lead"
  echo
  echo "Si salió un id numérico, la oportunidad está en el pipeline de ventas."
  echo "Borrarla desde Odoo buscando por \"PRUEBA TECNICA\"."
}

case "${1:-payload}" in
  api)     modo_api ;;
  odoo)    modo_odoo ;;
  payload) payload ;;
  *) echo "uso: $0 [api|odoo|payload]" >&2; exit 2 ;;
esac
