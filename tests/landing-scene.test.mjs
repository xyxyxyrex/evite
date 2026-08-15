import assert from "node:assert/strict";
import test from "node:test";
import {
  getMagicTrailPoint,
  getSceneOffsets,
  normalizeOrientation,
  normalizeScenePointer,
  sampleMagicTrail,
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

test("wraps magic trail progress into one continuous loop", () => {
  assert.deepEqual(getMagicTrailPoint(0), getMagicTrailPoint(1));
  assert.deepEqual(getMagicTrailPoint(0.25), getMagicTrailPoint(1.25));
  assert.deepEqual(getMagicTrailPoint(0.75), getMagicTrailPoint(-0.25));
});

test("keeps the magic trail finite and inside the portrait", () => {
  for (let i = 0; i < 32; i++) {
    const point = getMagicTrailPoint(i / 32);
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
    assert.ok(point.x >= 0.04 && point.x <= 0.96);
    assert.ok(point.y >= 0.12 && point.y <= 0.9);
  }
});

test("routes the trail around the central face region", () => {
  for (let i = 0; i < 32; i++) {
    const { x, y } = getMagicTrailPoint(i / 32);
    const insideFace = x > 0.31 && x < 0.76 && y > 0.2 && y < 0.58;
    assert.equal(insideFace, false);
  }
});

test("interpolates continuously between cached magic trail samples", () => {
  const output = { x: 0, y: 0 };
  const result = sampleMagicTrail(0.125, [0, 1, 0, -1], [0, 0, 1, 0], output);
  assert.equal(result, output);
  assert.deepEqual(output, { x: 0.5, y: 0 });

  sampleMagicTrail(1.125, [0, 1, 0, -1], [0, 0, 1, 0], output);
  assert.deepEqual(output, { x: 0.5, y: 0 });
});

test("normalizes and clamps phone orientation deltas", () => {
  assert.deepEqual(normalizeOrientation(0, 0), { x: 0, y: 0 });
  assert.deepEqual(normalizeOrientation(9, -18), { x: -1, y: 0.5 });
  assert.deepEqual(normalizeOrientation(-90, 90), { x: 1, y: -1 });
  assert.deepEqual(normalizeOrientation(Number.NaN, 4), { x: 0, y: 0 });
});
