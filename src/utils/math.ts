// src/utils/math.ts
export function kellyFraction(estProb: number, price: number, cap = 0.06): number {
  if (estProb <= 0 || estProb >= 1 || price <= 0 || price >= 1) return 0;
  const b = (1 / price) - 1;
  const f = (estProb * b - (1 - estProb)) / b;
  return f <= 0 ? 0 : Math.min(f / 2, cap);
}
