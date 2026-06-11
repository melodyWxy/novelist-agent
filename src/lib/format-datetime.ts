/**
 * SSR-safe datetime display — fixed pattern, avoids locale / hour12 mismatch
 * between Node and browsers during hydration.
 */
export function formatDateTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');

  return `${y}/${m}/${day} ${h}:${min}:${s}`;
}
