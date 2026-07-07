export function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  const normalized = Math.abs(value) < 1e-10 ? 0 : value;
  return Number(normalized.toFixed(4)).toString();
}

export function formatPoint3D(point: [number, number, number]) {
  return `(${point.map(formatNumber).join(", ")})`;
}
