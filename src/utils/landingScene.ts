export interface ScenePointer {
  x: number;
  y: number;
}

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
