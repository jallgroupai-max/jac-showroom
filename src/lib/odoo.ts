// Cliente JSON-RPC de Odoo — la capa de transporte, sin lógica de negocio.
// Odoo no expone REST: todo pasa por POST a /jsonrpc envolviendo llamadas al
// ORM. Son dos servicios:
//   - `common.authenticate` → devuelve el uid (entero) o false.
//   - `object.execute`      → cualquier método del ORM sobre un modelo.
//
// Quien construye el lead es src/lib/crm.ts; acá solo vive el protocolo.

// Se leen en cada llamada, no una vez al cargar el módulo: así basta con
// tocar el .env (o las variables del contenedor) y reiniciar el proceso, sin
// depender de cuándo se importó este archivo.
const env = () => ({
  url: process.env.ODOO_URL ?? "",
  db: process.env.ODOO_DB ?? "",
  user: process.env.ODOO_USER ?? "",
  key: process.env.ODOO_API_KEY ?? "",
});

// Odoo responde en segundos salvo que la instancia esté saturada. El corte
// existe para que un CRM lento no deje colgado el request del formulario: el
// lead ya está persistido en Postgres y queda reintentable desde /admin/leads.
const TIMEOUT_MS = 10_000;

/**
 * Por qué la integración no puede usarse, o `null` si está lista. Devuelve el
 * motivo en vez de un booleano para que el panel pueda decir "está apagada"
 * en lugar de "el CRM falló" — son dos problemas distintos y confundirlos
 * manda a revisar el CRM cuando lo que falta es una variable de entorno.
 */
export function odooUnavailableReason(): string | null {
  if (process.env.ODOO_ENABLED !== "true") {
    return "La integración con Odoo está desactivada (ODOO_ENABLED=false)";
  }
  const { url, db, user, key } = env();
  const faltan = [
    !url && "ODOO_URL",
    !db && "ODOO_DB",
    !user && "ODOO_USER",
    !key && "ODOO_API_KEY",
  ].filter(Boolean);
  return faltan.length > 0 ? `Faltan variables de entorno: ${faltan.join(", ")}` : null;
}

export class OdooError extends Error {}

// Odoo responde HTTP 200 incluso cuando falla: el error viene en el body,
// dentro de `error.data.message`. Sin este chequeo, un lead rechazado se
// registraría como enviado.
async function rpc(service: string, method: string, args: unknown[]): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${env().url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: 1 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (cause) {
    // Red caída, DNS, o el timeout de arriba.
    throw new OdooError(`No se pudo contactar a Odoo: ${(cause as Error).message}`);
  }
  if (!res.ok) throw new OdooError(`Odoo respondió HTTP ${res.status}`);

  const body = (await res.json()) as { result?: unknown; error?: { data?: { message?: string } } };
  if (body.error) throw new OdooError(body.error.data?.message ?? "Error desconocido de Odoo");
  return body.result;
}

// El uid es estable mientras no cambien las credenciales, así que se cachea en
// el proceso: autenticar en cada lead duplicaría la latencia sin ganar nada.
let cachedUid: number | null = null;

async function authenticate(): Promise<number> {
  if (cachedUid !== null) return cachedUid;
  const { db, user, key } = env();
  const result = await rpc("common", "authenticate", [db, user, key, {}]);
  // Credenciales malas devuelven `false`, no un error JSON-RPC.
  if (typeof result !== "number") {
    throw new OdooError("Credenciales de Odoo inválidas (revisar ODOO_DB, ODOO_USER, ODOO_API_KEY)");
  }
  cachedUid = result;
  return result;
}

/**
 * Ejecuta un método del ORM: `execute(db, uid, key, modelo, método, ...args)`.
 * Ojo: `execute` es posicional y NO acepta kwargs — si algún día hace falta
 * pasar `context` o `limit`, hay que migrar a `execute_kw`.
 */
export async function execute<T>(model: string, method: string, ...args: unknown[]): Promise<T> {
  const uid = await authenticate();
  try {
    const { db, key } = env();
    return (await rpc("object", "execute", [db, uid, key, model, method, ...args])) as T;
  } catch (error) {
    // Una key rotada invalida el uid cacheado: se descarta para que el próximo
    // intento vuelva a autenticar en vez de fallar para siempre.
    if (error instanceof OdooError && /access denied/i.test(error.message)) cachedUid = null;
    throw error;
  }
}

/**
 * `create` devuelve el id como número en unas versiones de Odoo y como `[id]`
 * en otras. Normaliza ambos casos y verifica que sea utilizable.
 */
export function normalizeCreatedId(raw: unknown): number {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "number" || !Number.isFinite(id) || id <= 0) {
    throw new OdooError(`Odoo devolvió un id inesperado: ${JSON.stringify(raw)}`);
  }
  return id;
}
