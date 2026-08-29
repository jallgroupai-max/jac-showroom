# scripts/ — utilidades del CRM Odoo

Dos formas de usar esto: **curl suelto** (para Postman o la terminal) y **los
scripts `.sh`** (para encadenar pasos sin copiar ids a mano).

Credenciales y endpoint viven en `.env` (`ODOO_URL`, `ODOO_DB`, `ODOO_USER`,
`ODOO_API_KEY`). Ninguna está escrita en estos archivos.

---

## Curl para Postman

Postman importa curl directamente: `Import` → pestaña **Raw text** → pegar →
`Continue` → `Import`. Arma el request con su header y su body.

Sustituir `TU_API_KEY` por el valor de `ODOO_API_KEY`.

### 1. Autenticar — devuelve el `uid`

```
curl -X POST https://odoo.bel.com.ve/jsonrpc -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"call\",\"params\":{\"service\":\"common\",\"method\":\"authenticate\",\"args\":[\"bel_odoo\",\"showroom\",\"TU_API_KEY\",{}]},\"id\":1}"
```

Respuesta: `{"result": 6888}`. Si devuelve `false`, las credenciales están mal.
El uid es estable — solo cambia si se rota la API Key.

### 2. Crear la oportunidad — un solo request

`name` y `type` son los únicos campos obligatorios de `crm.lead`, así que no
hace falta crear el contacto antes.

```
curl -X POST https://odoo.bel.com.ve/jsonrpc -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"call\",\"params\":{\"service\":\"object\",\"method\":\"execute\",\"args\":[\"bel_odoo\",6888,\"TU_API_KEY\",\"crm.lead\",\"create\",{\"name\":\"Showroom 360 - Aventura 4X4 - PRUEBA TECNICA\",\"type\":\"opportunity\",\"contact_name\":\"PRUEBA TECNICA - Juan Perez\",\"phone\":\"+584120123456\",\"email_from\":\"prueba.tecnica@example.com\",\"company_type\":\"person\",\"city\":\"Barquisimeto\",\"description\":\"<p><b>Vehiculo:</b> Aventura 4X4 (Frison T9 4X4)<br><b>Color:</b> Blanco Perlado<br><b>Test drive:</b> Si<br><b>Canal preferido:</b> WhatsApp<br><b>Origen:</b> Escritorio</p>\"}]},\"id\":1}"
```

Respuesta: `{"result": 1234}` — el id de la oportunidad creada.

Dos detalles que muerden:

- **Odoo responde HTTP 200 aunque falle.** El error viene en `error.data.message`
  dentro del body, no en el status. Postman va a mostrar `200 OK` igual.
- **`description` es un campo HTML.** Los saltos de línea van con `<br>`; un
  `\n` sale como texto pegado en la ficha del asesor.

### 3. Buscar un contacto existente (dedupe por teléfono o correo)

```
curl -X POST https://odoo.bel.com.ve/jsonrpc -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"call\",\"params\":{\"service\":\"object\",\"method\":\"execute\",\"args\":[\"bel_odoo\",6888,\"TU_API_KEY\",\"res.partner\",\"search_read\",[\"|\",\"|\",[\"phone\",\"=\",\"+584120123456\"],[\"mobile\",\"=\",\"+584120123456\"],[\"email\",\"=ilike\",\"prueba.tecnica@example.com\"]],[\"id\",\"name\",\"phone\",\"email\"]]},\"id\":1}"
```

Devuelve `[]` si no existe. Con el `id` que devuelva se puede pasar
`"partner_id": <id>` al request del punto 2 para ligar la oportunidad.

### 4. Nuestro endpoint del showroom

El flujo completo: valida, guarda en Postgres y recién ahí llama a Odoo.

```
curl -X POST http://localhost:3000/api/leads -H "Content-Type: application/json" -d "{\"website\":\"\",\"fullName\":\"PRUEBA TECNICA - Juan Perez\",\"phone\":\"+58 412 0123456\",\"email\":\"prueba.tecnica@example.com\",\"dealerId\":\"cualquiera\",\"contactChannel\":\"whatsapp\",\"wantsTestDrive\":true,\"vehicleSlug\":\"aventura-4x4\",\"vehicleCommercialName\":\"Aventura 4X4\",\"vehicleTechnicalName\":\"Frison T9 4X4\",\"variantColorName\":\"Blanco Perlado\",\"origin\":\"desktop\"}"
```

Responde `{"success":true,"syncedToOdoo":true|false}`. En `false` el lead igual
quedó guardado y se reintenta desde `/admin/leads`.

Al probarlo:

- **`dealerId` puede ser cualquier string.** Si el id no existe, el endpoint cae
  al primer concesionario activo.
- **`website` es el honeypot anti-spam.** Si va con contenido, responde éxito y
  NO guarda nada.
- **Rate limit: 5 envíos por IP cada 10 minutos.** Al sexto devuelve 429.

---

## Los scripts `.sh`

Corren en **Git Bash** (no en PowerShell ni en CMD). Desde la raíz del repo:

```bash
set -a; . .env; set +a      # carga ODOO_* del .env, una vez por terminal
```

### `odoo-check.sh` — sondas de lectura

No crea ni modifica nada; solo `fields_get` y `search_read`.

```bash
./scripts/odoo-check.sh fields     # todos los campos de crm.lead con tipo y obligatoriedad
./scripts/odoo-check.sh type       # valores válidos de type / company_type / priority
./scripts/odoo-check.sh states     # los 25 estados de Venezuela con sus ids
./scripts/odoo-check.sh partner    # campos de res.partner
```

### `odoo-lead-example.sh` — registro de un lead

```bash
./scripts/odoo-lead-example.sh payload   # imprime el JSON, no envía nada
./scripts/odoo-lead-example.sh api       # POST a /api/leads (necesita `npm run dev`)
./scripts/odoo-lead-example.sh odoo      # JSON-RPC directo: auth -> contacto -> oportunidad
```

`odoo` encadena los tres pasos resolviendo el `uid` y el `partner_id` solo, que
es lo que el curl suelto obliga a copiar a mano.

---

## Sobre las pruebas

`odoo-lead-example.sh api`, `odoo-lead-example.sh odoo` y el curl del punto 2
**crean registros reales en el CRM de producción**, visibles para los asesores.
Por eso los datos de ejemplo llevan el prefijo `PRUEBA TECNICA`: se identifican
y se borran buscando ese texto en Odoo.
