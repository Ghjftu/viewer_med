export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const clampOpacity = (value: number) => clamp(value, 0, 1);

export const getStep = (worldSpan: number, pixelSpan: number, minPxPerMajor = 80): number => {
  const roughStep = worldSpan / (pixelSpan / minPxPerMajor);
  if (roughStep <= 0 || !Number.isFinite(roughStep)) return 10;
  const exponent = Math.floor(Math.log10(roughStep));
  const base = Math.pow(10, exponent);
  const normalized = roughStep / base;
  if (normalized < 1.5) return base;
  if (normalized < 3.5) return 2 * base;
  if (normalized < 7.5) return 5 * base;
  return 10 * base;
};

export const formatValue = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 1) return value.toFixed(1);
  return value.toFixed(2);
};