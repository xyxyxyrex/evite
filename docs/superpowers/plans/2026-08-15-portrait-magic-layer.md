# Portrait Magic Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the middle portrait layer visibly frame Isabel with an optimized looping gold trail and bounded magic dust.

**Architecture:** Render one logical orbit across synchronized rear/front canvases around the transparent portrait. Precompute normalized path coordinates and glow artwork, interpolate them at 60 FPS, and feed smoothed pointer or orientation input through one parallax update pipeline.

**Tech Stack:** Astro, TypeScript, Canvas 2D, Node test runner

## Global Constraints

- Preserve the exact layer order: background, rear magic canvas, transparent foreground portrait, front magic canvas.
- Do not add dependencies or allocate objects inside animation frames.
- Target 60 FPS while retaining 6 mobile / 12 desktop particles and DPR caps of 1 / 1.5.
- Pause while hidden and clean up the canvas with the existing lifecycle.
- Keep the effect away from Isabel's face and readable around her hair, shoulders, and dress.
- Do not deploy or push to Cloudflare.

---

### Task 1: Silhouette-Framing Magic Trail

**Files:**
- Modify: `src/utils/landingScene.ts`
- Modify: `src/components/HeroSection.astro`
- Modify: `tests/landing-scene.test.mjs`

**Interfaces:**
- Produces: `getMagicTrailPoint(progress: number): ScenePointer`, a clamped normalized point on the portrait-safe loop.
- Consumes: existing scene canvas, render budget, visibility lifecycle, and parallax transform.

- [x] **Step 1: Write the failing geometry tests**

Add assertions that `getMagicTrailPoint()` wraps progress, returns finite normalized coordinates, and places sampled points along the portrait perimeter rather than the central face region.

- [x] **Step 2: Run the focused tests and confirm failure**

Run: `npm.cmd run test:unit`
Expected: FAIL because `getMagicTrailPoint` is not exported.

- [x] **Step 3: Implement normalized trail geometry**

Add a deterministic piecewise cubic Bezier loop in `landingScene.ts`, with no runtime allocation in the canvas frame path.

- [x] **Step 4: Extend the existing canvas renderer**

Draw a low-opacity static loop, a short traveling gold tail, one brighter head glint, and the existing fixed sparkle pool. For reduced motion, draw the static loop once instead of hiding the middle layer.

- [x] **Step 5: Verify behavior and budgets**

Run `npm.cmd run test:unit`, `npm.cmd run astro -- check`, `npm.cmd run test:build`, and `git diff --check`. Confirm the canvas remains between the background and foreground in CSS and no new dependency exists.

- [x] **Step 6: Commit locally**

Commit the focused implementation and tests on `master`; do not push or deploy.

---

### Task 2: Continuous Front/Rear Orbit And Gyroscope Parallax

**Files:**
- Modify: `src/utils/landingScene.ts`
- Modify: `src/utils/performance.ts`
- Modify: `src/components/HeroSection.astro`
- Modify: `tests/landing-scene.test.mjs`
- Modify: `tests/performance.test.mjs`
- Modify: `tests/build-output.test.mjs`

**Interfaces:**
- Produce `sampleMagicTrail(progress, xSamples, ySamples)` for allocation-free interpolated coordinates.
- Produce `normalizeOrientation(beta, gamma)` for clamped `ScenePointer` gyro input.
- Consume one rear canvas and one front canvas driven by the same orbit progress.

- [x] **Step 1: Add failing interpolation, gyro, 60 FPS, and output tests**

Assert continuous midpoint interpolation, orientation clamping, `sceneSparkleFps: 60` in full/mobile profiles, and emitted rear/front canvas ordering.

- [x] **Step 2: Run `npm.cmd run test:unit` and confirm the new tests fail**

Expected failures: missing scene helpers and old scene FPS values.

- [x] **Step 3: Implement scene math and rendering budgets**

Add allocation-free output parameters for trail sampling, normalize device orientation into bounded parallax coordinates, and set the scene canvas target to 60 FPS.

- [x] **Step 4: Split and synchronize the orbit renderer**

Add `scene-magic-front` above the foreground. Draw rear and front arc ranges with crossover fades, interpolate the moving head continuously, and reuse one cached glow sprite with screen blending on the front canvas.

- [x] **Step 5: Add gyroscope lifecycle**

Attach device orientation where available, request iOS permission from the first portrait tap, smooth/clamp readings through the existing input RAF, and remove every new listener during teardown.

- [x] **Step 6: Verify and commit locally**

Run unit tests, Astro check, build-output tests, diff check, and a mobile browser canvas/layer-order check. Commit on `master` without pushing or deploying.
