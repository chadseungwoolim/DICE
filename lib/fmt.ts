export function bytes(n: number): string {
  if (!isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 2 : 1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
export function pct(x: number, d = 2): string {
  return `${(x * 100).toFixed(d)} %`;
}
export function sci(x: number, d = 2): string {
  if (x === 0) return "0";
  if (!isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a >= 1e-3 && a < 1e5) return x.toFixed(d + 2).replace(/\.?0+$/, "") || "0";
  return x.toExponential(d);
}
export function fixed(x: number, d = 2): string {
  return isFinite(x) ? x.toFixed(d) : x > 0 ? "∞" : "—";
}
