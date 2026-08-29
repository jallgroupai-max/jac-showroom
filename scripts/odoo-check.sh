#!/usr/bin/env bash
# Sondas de lectura contra el Odoo de BEL — no crea ni modifica nada.
#   ODOO_API_KEY=xxx ./odoo-check.sh [fields|type|states|partner]
#
# Para no exportar a mano, las variables salen del propio .env:
#   set -a; . .env; set +a; ./scripts/odoo-check.sh fields
set -euo pipefail

ODOO_URL="${ODOO_URL:-https://odoo.bel.com.ve}"
ODOO_DB="${ODOO_DB:-bel_odoo}"
ODOO_USER="${ODOO_USER:-showroom}"
: "${ODOO_API_KEY:?falta ODOO_API_KEY — exportala o cargá el .env, no la escribas aqui}"

rpc() { curl -sS --max-time 30 "$ODOO_URL/jsonrpc" -H "Content-Type: application/json" -d "$1"; }

# Paso 1 — autenticar. Devuelve el uid (entero) o false si las credenciales fallan.
auth() {
  rpc "{\"jsonrpc\":\"2.0\",\"method\":\"call\",\"params\":{\"service\":\"common\",
       \"method\":\"authenticate\",\"args\":[\"$ODOO_DB\",\"$ODOO_USER\",\"$ODOO_API_KEY\",{}]},\"id\":1}"
}

# Paso 2 — cualquier llamada al ORM: execute(db, uid, key, modelo, metodo, ...args)
call() { # $1=uid $2=modelo $3=metodo $4=args JSON
  rpc "{\"jsonrpc\":\"2.0\",\"method\":\"call\",\"params\":{\"service\":\"object\",
       \"method\":\"execute\",\"args\":[\"$ODOO_DB\",$1,\"$ODOO_API_KEY\",\"$2\",\"$3\",$4]},\"id\":1}"
}

UIDN=$(auth | sed -n 's/.*"result": *\([0-9]*\).*/\1/p')
[ -n "$UIDN" ] || { echo "auth fallo: $(auth)" >&2; exit 1; }
echo "uid=$UIDN" >&2

case "${1:-fields}" in
  # Todos los campos de crm.lead con tipo y obligatoriedad.
  fields)  call "$UIDN" crm.lead    fields_get '[],["string","type","required"]' ;;
  # Valores validos de los campos selection.
  type)    call "$UIDN" crm.lead    fields_get '["type","company_type","priority"],["selection","string"]' ;;
  # Catalogo de estados de Venezuela (id -> nombre) para el selector del formulario.
  states)  call "$UIDN" res.country.state search_read '[["country_id.code","=","VE"]],["id","name"]' ;;
  # Campos de res.partner, para el paso de buscar/crear contacto.
  partner) call "$UIDN" res.partner fields_get '[],["string","type","required"]' ;;
  *) echo "uso: $0 [fields|type|states|partner]" >&2; exit 2 ;;
esac
