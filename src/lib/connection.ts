"use client";

import { useEffect, useState } from "react";
import type { Quality } from "./types";

// Detección HÍBRIDA de velocidad de conexión — ver docs/TRD.md §4.2.
// Criterio no negociable: nunca debe romper la experiencia. Si ambas
// señales fallan o no están disponibles, se asume el peor caso (slow) y
// jamás se bloquea esperando una detección que no llega.

export type ConnectionTier = "slow" | "medium" | "fast";

interface NavigatorConnection {
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

function getNavigatorConnection(): NavigatorConnection | undefined {
  if (typeof navigator === "undefined") return undefined;
  // Network Information API — no soportada en Safari/iOS, por eso es solo
  // una señal inicial, nunca la única fuente de verdad.
  return (navigator as unknown as { connection?: NavigatorConnection }).connection;
}

function tierFromEffectiveType(effectiveType?: string): ConnectionTier | undefined {
  switch (effectiveType) {
    case "4g":
      return "fast";
    case "3g":
      return "medium";
    case "2g":
    case "slow-2g":
      return "slow";
    default:
      return undefined;
  }
}

function tierFromThroughputKBps(kbps: number): ConnectionTier {
  if (kbps >= 800) return "fast";
  if (kbps >= 200) return "medium";
  return "slow";
}

/**
 * Mide el throughput real descargando una imagen conocida (ya presente en
 * /public) y devuelve KB/s. Es el mecanismo confiable que funciona en
 * cualquier navegador, usado para validar/corregir la señal de
 * navigator.connection de forma continua durante la sesión.
 */
export async function measureThroughputKBps(sampleUrl: string): Promise<number | null> {
  if (typeof performance === "undefined" || typeof fetch === "undefined") return null;
  try {
    const start = performance.now();
    const res = await fetch(sampleUrl, { cache: "no-store" });
    const blob = await res.blob();
    const elapsedSec = (performance.now() - start) / 1000;
    if (elapsedSec <= 0) return null;
    const kb = blob.size / 1024;
    return kb / elapsedSec;
  } catch {
    // Nunca debe romper la experiencia: si falla la medición, no hay señal.
    return null;
  }
}

/**
 * Hook híbrido: arranca con navigator.connection (si existe) como señal
 * rápida, y se autocorrige con medición real de throughput. Si ninguna
 * señal está disponible, cae a "slow" (peor caso seguro) sin bloquear.
 */
export function useConnectionTier(sampleUrlForMeasurement?: string): ConnectionTier {
  const [tier, setTier] = useState<ConnectionTier>(() => {
    const conn = getNavigatorConnection();
    return tierFromEffectiveType(conn?.effectiveType) ?? "slow";
  });

  useEffect(() => {
    const conn = getNavigatorConnection();
    if (!conn?.addEventListener) return;
    const onChange = () => {
      const next = tierFromEffectiveType(conn.effectiveType);
      if (next) setTier(next);
    };
    conn.addEventListener("change", onChange);
    return () => conn.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (!sampleUrlForMeasurement) return;
    let cancelled = false;
    measureThroughputKBps(sampleUrlForMeasurement).then((kbps) => {
      if (!cancelled && kbps !== null) setTier(tierFromThroughputKBps(kbps));
    });
    return () => {
      cancelled = true;
    };
  }, [sampleUrlForMeasurement]);

  return tier;
}

/** Calidad mínima con la que se puede dejar entrar al usuario desde Loading. */
export function readyThresholdForTier(tier: ConnectionTier): Quality {
  if (tier === "fast") return "high";
  if (tier === "medium") return "medium";
  return "low";
}
