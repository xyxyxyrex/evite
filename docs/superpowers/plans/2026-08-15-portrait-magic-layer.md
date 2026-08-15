# Portrait Magic Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the middle portrait layer visibly frame Isabel with an optimized looping gold trail and bounded magic dust.

**Architecture:** Extend the existing `scene-sparkles` canvas renderer rather than adding a dependency or animation loop. Precompute a normalized curved path, draw its traveling glow and fixed sparkle pool within the existing capped frame loop, and render a static version for reduced motion.

**Tech Stack:** Astro, TypeScript, Canvas 2D, Node test runner

## Global Constraints

- Preserve the exact layer order: background, magic canvas, transparent foreground portrait.
- Do not add dependencies or allocate objects inside animation frames.
- Retain existing mobile/desktop particle, FPS, and DPR budgets.
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

- [ ] **Step 1: Write the failing geometry tests**

Add assertions that `getMagicTrailPoint()` wraps progress, returns finite normalized coordinates, and places sampled points along the portrait perimeter rather than the central face region.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm.cmd run test:unit`
Expected: FAIL because `getMagicTrailPoint` is not exported.

- [ ] **Step 3: Implement normalized trail geometry**

Add a deterministic piecewise cubic Bezier loop in `landingScene.ts`, with no runtime allocation in the canvas frame path.

- [ ] **Step 4: Extend the existing canvas renderer**

Draw a low-opacity static loop, a short traveling gold tail, one brighter head glint, and the existing fixed sparkle pool. For reduced motion, draw the static loop once instead of hiding the middle layer.

- [ ] **Step 5: Verify behavior and budgets**

Run `npm.cmd run test:unit`, `npm.cmd run astro -- check`, `npm.cmd run test:build`, and `git diff --check`. Confirm the canvas remains between the background and foreground in CSS and no new dependency exists.

- [ ] **Step 6: Commit locally**

Commit the focused implementation and tests on `master`; do not push or deploy.
