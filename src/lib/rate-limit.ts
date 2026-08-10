// Rate limiting por IP — ventana deslizante en memoria (plan A7, TRD §6.1/§8).
// Suficiente para el despliegue actual (una instancia en Docker); si algún
// día hay varias réplicas, este módulo se reemplaza por Redis/upstash sin
// tocar a los llamadores.

type Window = { timestamps: number[] };

const buckets = new Map<string, Window>();

// Limpieza periódica para que el Map no crezca sin límite con IPs efímeras.
const SWEEP_INTERVAL_MS = 10 * 60_000;
let lastSweep = Date.now();

export function rateLimit(options: {
  /** Clave del limitador — combinar acción + IP: `login:1.2.3.4`. */
  key: string;
  /** Máximo de eventos permitidos dentro de la ventana. */
  limit: number;
  /** Ancho de la ventana en segundos. */
  windowSeconds: number;
}): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;

  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      if (bucket.timestamps.every((t) => now - t > windowMs)) buckets.delete(key);
    }
  }

  const bucket = buckets.get(options.key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= options.limit) {
    buckets.set(options.key, bucket);
    return { allowed: false, remaining: 0 };
  }

  bucket.timestamps.push(now);
  buckets.set(options.key, bucket);
  return { allowed: true, remaining: options.limit - bucket.timestamps.length };
}

/** IP del cliente detrás del proxy/CDN habitual. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "local"
  );
}
