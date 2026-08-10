// "Actualizado hoy / ayer / hace N días…" — mismo lenguaje que las cards del
// prototipo de la biblioteca.
export function updatedAgo(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Actualizado hoy";
  if (days === 1) return "Actualizado ayer";
  if (days < 7) return `Hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "Hace 1 semana";
  if (weeks < 5) return `Hace ${weeks} semanas`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "Hace 1 mes" : `Hace ${months} meses`;
}
