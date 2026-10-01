/**
 * Bounds a finite layout value while tolerating callers whose maximum is
 * temporarily below the minimum during viewport resize.
 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
