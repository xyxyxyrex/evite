import assert from "node:assert/strict";
import test from "node:test";
import {
  clampRevealProgress,
  easeHandwritingProgress,
  getMoteSpawnCount,
} from "../src/utils/handwriting.ts";

test("clamps reveal progress to a finite unit interval", () => {
  assert.equal(clampRevealProgress(-0.5), 0);
  assert.equal(clampRevealProgress(0.4), 0.4);
  assert.equal(clampRevealProgress(2), 1);
  assert.equal(clampRevealProgress(Number.NaN), 0);
});

test("eases the reveal through stable endpoints and midpoint", () => {
  assert.equal(easeHandwritingProgress(0), 0);
  assert.equal(easeHandwritingProgress(0.5), 0.5);
  assert.equal(easeHandwritingProgress(1), 1);
  assert.ok(easeHandwritingProgress(0.25) < 0.25);
  assert.ok(easeHandwritingProgress(0.75) > 0.75);
});

test("emits motes by traveled distance without exceeding the active cap", () => {
  assert.equal(getMoteSpawnCount(5, 12, 0, 4), 0);
  assert.equal(getMoteSpawnCount(25, 12, 0, 4), 2);
  assert.equal(getMoteSpawnCount(60, 12, 3, 4), 1);
  assert.equal(getMoteSpawnCount(60, 12, 4, 4), 0);
});

test("rejects invalid mote emission inputs", () => {
  assert.equal(getMoteSpawnCount(Number.NaN, 12, 0, 4), 0);
  assert.equal(getMoteSpawnCount(20, 0, 0, 4), 0);
  assert.equal(getMoteSpawnCount(20, 12, -1, 4), 0);
  assert.equal(getMoteSpawnCount(20, 12, 0, -1), 0);
});
