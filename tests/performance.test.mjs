import assert from "node:assert/strict";
import test from "node:test";
import { getRenderingBudget } from "../src/utils/performance.ts";

test("uses full animation budgets on desktop", () => {
  assert.deepEqual(getRenderingBudget(1280, false), {
    profile: "full",
    starCount: 80,
    starfieldFps: 60,
    handwritingParticleScale: 1,
    handwritingMoteLimit: 4,
    handwritingCanvasDpr: 1.5,
    confettiParticles: 180,
  });
});

test("caps animation budgets on mobile", () => {
  assert.deepEqual(getRenderingBudget(390, false), {
    profile: "mobile",
    starCount: 20,
    starfieldFps: 20,
    handwritingParticleScale: 0.4,
    handwritingMoteLimit: 2,
    handwritingCanvasDpr: 1,
    confettiParticles: 40,
  });
});

test("reduced motion disables continuous and particle animation", () => {
  assert.deepEqual(getRenderingBudget(1280, true), {
    profile: "reduced",
    starCount: 0,
    starfieldFps: 0,
    handwritingParticleScale: 0,
    handwritingMoteLimit: 0,
    handwritingCanvasDpr: 0,
    confettiParticles: 0,
  });
});

test("invalid viewport widths use the conservative mobile budget", () => {
  assert.equal(getRenderingBudget(Number.NaN, false).profile, "mobile");
  assert.equal(getRenderingBudget(-1, false).profile, "mobile");
});

test("keeps the short handwriting effect within mobile canvas limits", () => {
  const budget = getRenderingBudget(390, false);
  assert.ok(budget.handwritingMoteLimit <= 2);
  assert.ok(budget.handwritingCanvasDpr <= 1);
});
