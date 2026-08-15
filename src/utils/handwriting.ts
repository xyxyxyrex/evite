export function clampRevealProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function easeHandwritingProgress(progress: number): number {
  const clamped = clampRevealProgress(progress);
  if (clamped === 0.5) return 0.5;
  return 0.5 - Math.cos(Math.PI * clamped) / 2;
}

export function getMoteSpawnCount(
  distance: number,
  spacing: number,
  activeCount: number,
  maxMotes: number,
): number {
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(spacing) ||
    !Number.isInteger(activeCount) ||
    !Number.isInteger(maxMotes) ||
    distance < 0 ||
    spacing <= 0 ||
    activeCount < 0 ||
    maxMotes < 0
  ) {
    return 0;
  }

  return Math.min(Math.floor(distance / spacing), Math.max(0, maxMotes - activeCount));
}
