export interface ScenePointer {
  x: number;
  y: number;
}

const MAGIC_TRAIL_SEGMENTS = [
  [0.1, 0.32, 0.11, 0.18, 0.31, 0.12, 0.5, 0.14],
  [0.5, 0.14, 0.77, 0.12, 0.94, 0.27, 0.89, 0.49],
  [0.89, 0.49, 0.96, 0.7, 0.73, 0.89, 0.5, 0.88],
  [0.5, 0.88, 0.2, 0.91, 0.04, 0.65, 0.1, 0.32],
] as const;

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

export function normalizeScenePointer(
  clientX: number,
  clientY: number,
  left: number,
  top: number,
  width: number,
  height: number,
): ScenePointer {
  if (
    ![clientX, clientY, left, top, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return { x: 0, y: 0 };
  }

  return {
    x: clampAxis(((clientX - left) / width) * 2 - 1),
    y: clampAxis(((clientY - top) / height) * 2 - 1),
  };
}

export function getSceneOffsets(pointer: ScenePointer) {
  const x = Number.isFinite(pointer.x) ? clampAxis(pointer.x) : 0;
  const y = Number.isFinite(pointer.y) ? clampAxis(pointer.y) : 0;

  return {
    background: { x: x * 4, y: y * 4 },
    sparkles: { x: x * 8, y: y * 8 },
    foreground: { x: x * 12, y: y * 12 },
  };
}

export function getMagicTrailPoint(progress: number): ScenePointer {
  const wrapped = Number.isFinite(progress) ? ((progress % 1) + 1) % 1 : 0;
  const scaled = wrapped * MAGIC_TRAIL_SEGMENTS.length;
  const segment = MAGIC_TRAIL_SEGMENTS[Math.min(Math.floor(scaled), MAGIC_TRAIL_SEGMENTS.length - 1)];
  const t = scaled - Math.floor(scaled);
  const inverse = 1 - t;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * t;
  const c = 3 * inverse * t * t;
  const d = t * t * t;

  return {
    x: a * segment[0] + b * segment[2] + c * segment[4] + d * segment[6],
    y: a * segment[1] + b * segment[3] + c * segment[5] + d * segment[7],
  };
}
