import assert from "node:assert/strict";
import test from "node:test";
import {
  getSceneOffsets,
  normalizeScenePointer,
} from "../src/utils/landingScene.ts";

test("normalizes the scene center and edges", () => {
  assert.deepEqual(normalizeScenePointer(150, 250, 100, 200, 100, 100), { x: 0, y: 0 });
  assert.deepEqual(normalizeScenePointer(100, 200, 100, 200, 100, 100), { x: -1, y: -1 });
  assert.deepEqual(normalizeScenePointer(200, 300, 100, 200, 100, 100), { x: 1, y: 1 });
});

test("clamps pointer input outside the scene", () => {
  assert.deepEqual(normalizeScenePointer(-500, 900, 100, 200, 100, 100), { x: -1, y: 1 });
});

test("falls back to center for invalid scene geometry", () => {
  assert.deepEqual(normalizeScenePointer(0, 0, 0, 0, 0, 100), { x: 0, y: 0 });
  assert.deepEqual(normalizeScenePointer(Number.NaN, 0, 0, 0, 100, 100), { x: 0, y: 0 });
});

test("maps normalized input to bounded depth offsets", () => {
  assert.deepEqual(getSceneOffsets({ x: 1, y: -0.5 }), {
    background: { x: 4, y: -2 },
    sparkles: { x: 8, y: -4 },
    foreground: { x: 12, y: -6 },
  });
});
