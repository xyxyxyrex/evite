# Handwritten Greeting Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the clipped, frame-randomized guest-name reveal with a fixed-layout masked reveal, feathered independent glow, and bounded pen-tip glint that stays smooth and memory-safe on iPhone-sized screens.

**Architecture:** Pure functions in `src/utils/handwriting.ts` will own reveal easing and bounded mote-emission calculations, while `src/utils/performance.ts` will provide profile-specific canvas and mote limits. `HeroSection.astro` will keep the text at its final width, update only CSS mask/transform properties, and use one short-lived canvas loop for a single glint plus a fixed mote pool.

**Tech Stack:** Astro 7, TypeScript, Node test runner, Canvas 2D, CSS masks and custom properties

## Global Constraints

- Preserve the current landing-page layout, navy-and-gold identity, cursive font, invitation content, acceptance interaction, music, and RSVP behavior.
- Animate the guest name for about 1.5 seconds with a gentle start, steady middle, and soft finish.
- Render exactly one leading glint and at most four motes on full profile, two on mobile, and none under reduced motion.
- Cap canvas device-pixel ratio at 1.5 on full profile and 1 on mobile.
- Do not animate text width or create a continuously running effect.
- Keep all frame, timeout, canvas, and particle cleanup in the hero lifecycle controller.
- Treat unavailable measurement or canvas context as an immediate completed-text fallback.
- Commit locally on `master`; do not push, deploy, or run the Cloudflare deploy script.

---

### Task 1: Handwriting Motion Contract

**Files:**
- Create: `src/utils/handwriting.ts`
- Create: `tests/handwriting.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `clampRevealProgress(value: number): number`.
- Produces: `easeHandwritingProgress(progress: number): number`.
- Produces: `getMoteSpawnCount(distance: number, spacing: number, activeCount: number, maxMotes: number): number`.
- Consumes: no DOM or browser globals; all functions are deterministic and testable in Node.

- [ ] **Step 1: Add the failing motion tests**

Create `tests/handwriting.test.mjs`:

```js
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
```

Add the new file to `test:unit` in `package.json`:

```json
"test:unit": "node --experimental-strip-types --test tests/guests.test.mjs tests/performance.test.mjs tests/handwriting.test.mjs"
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/handwriting.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/handwriting.ts`.

- [ ] **Step 3: Implement the pure motion functions**

Create `src/utils/handwriting.ts`:

```ts
export function clampRevealProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function easeHandwritingProgress(progress: number): number {
  const clamped = clampRevealProgress(progress);
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
```

- [ ] **Step 4: Run the focused and complete unit suites and verify GREEN**

Run:

```powershell
node --experimental-strip-types --test tests/handwriting.test.mjs
npm.cmd run test:unit
```

Expected: all handwriting tests and the existing guest/performance tests pass.

- [ ] **Step 5: Commit the motion contract**

```powershell
git add package.json tests/handwriting.test.mjs src/utils/handwriting.ts
git commit -m "test: define handwriting motion contract"
```

---

### Task 2: Profile-Specific Glint Budgets

**Files:**
- Modify: `src/utils/performance.ts`
- Modify: `tests/performance.test.mjs`

**Interfaces:**
- Extends: `RenderingBudget` with `handwritingMoteLimit: number` and `handwritingCanvasDpr: number`.
- Produces: full values `4` and `1.5`, mobile values `2` and `1`, reduced values `0` and `0`.
- Consumes: existing `getRenderingBudget(viewportWidth, reducedMotion)` profile selection.

- [ ] **Step 1: Extend expected budgets in the tests**

Add these literal properties to the three `deepEqual` expectations in `tests/performance.test.mjs`:

```js
// Full
handwritingMoteLimit: 4,
handwritingCanvasDpr: 1.5,

// Mobile
handwritingMoteLimit: 2,
handwritingCanvasDpr: 1,

// Reduced
handwritingMoteLimit: 0,
handwritingCanvasDpr: 0,
```

Add a focused boundary assertion:

```js
test("keeps the short handwriting effect within mobile canvas limits", () => {
  const budget = getRenderingBudget(390, false);
  assert.ok(budget.handwritingMoteLimit <= 2);
  assert.ok(budget.handwritingCanvasDpr <= 1);
});
```

- [ ] **Step 2: Run the performance tests and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/performance.test.mjs
```

Expected: the three budget equality tests FAIL because the new properties are absent.

- [ ] **Step 3: Extend the rendering budget**

Add the properties to `RenderingBudget` and all three budget constants in `src/utils/performance.ts`:

```ts
export interface RenderingBudget {
  profile: RenderingProfile;
  starCount: number;
  starfieldFps: number;
  handwritingParticleScale: number;
  handwritingMoteLimit: number;
  handwritingCanvasDpr: number;
  confettiParticles: number;
}
```

Use the exact full/mobile/reduced values declared by this task's interface.

- [ ] **Step 4: Run the complete unit suite and verify GREEN**

Run:

```powershell
npm.cmd run test:unit
```

Expected: all guest, performance, and handwriting tests pass.

- [ ] **Step 5: Commit the profile budgets**

```powershell
git add src/utils/performance.ts tests/performance.test.mjs
git commit -m "perf: cap handwritten glint resources"
```

---

### Task 3: Fixed-Layout Greeting Layers

**Files:**
- Modify: `tests/build-output.test.mjs`
- Modify: `src/components/HeroSection.astro`

**Interfaces:**
- Produces: `#guest-writing-glow`, an `aria-hidden` independent glow layer.
- Preserves: `#guest-name-reveal`, `#guest-sparkle-canvas`, and server-rendered guest text.
- Produces: a completed-state text glow only after the reveal mask is removed.

- [ ] **Step 1: Add a failing production-output contract**

Add to `tests/build-output.test.mjs`:

```js
test("build emits independent greeting glow and sparkle layers", () => {
  const html = readFileSync("dist/lara-espanola/index.html", "utf8");
  assert.match(html, /id="guest-writing-glow"/);
  assert.match(html, /id="guest-sparkle-canvas"/);
  assert.match(html, /aria-hidden="true"/);
});
```

- [ ] **Step 2: Build and verify RED**

Run:

```powershell
npm.cmd run test:build
```

Expected: FAIL because `guest-writing-glow` is not present in the built personalized page.

- [ ] **Step 3: Add the independent visual layers**

Inside `#guest-wrapper` in `HeroSection.astro`, preserve the text, insert the glow immediately after it, and keep exactly one copy of the existing canvas after the glow:

```astro
<span class="guest-writing-glow" id="guest-writing-glow" aria-hidden="true"></span>
<canvas class="sparkle-leading-canvas" id="guest-sparkle-canvas" aria-hidden="true"></canvas>
```

Keep the canvas after the glow so the crisp glint paints above the diffuse layer.

- [ ] **Step 4: Replace width clipping with a fixed-layout mask**

Change the reveal CSS contract to use custom properties:

```css
.inline-reveal-wrapper {
  --reveal-position: 0%;
  --reveal-x: 0px;
  position: relative;
  display: inline-flex;
  align-items: baseline;
  vertical-align: baseline;
  isolation: isolate;
}

.inline-reveal-text {
  display: inline-block;
  vertical-align: baseline;
  white-space: nowrap;
  opacity: 1;
  -webkit-mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(var(--reveal-position) - 18px),
    rgba(0, 0, 0, 0.75) calc(var(--reveal-position) - 8px),
    transparent var(--reveal-position),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(var(--reveal-position) - 18px),
    rgba(0, 0, 0, 0.75) calc(var(--reveal-position) - 8px),
    transparent var(--reveal-position),
    transparent 100%
  );
}

.guest-writing-glow {
  position: absolute;
  left: 0;
  top: 52%;
  width: 58px;
  height: 42px;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  transform: translate3d(var(--reveal-x), -50%, 0) translateX(-50%);
  background: radial-gradient(ellipse, rgba(255, 239, 166, 0.42) 0%, rgba(224, 174, 55, 0.16) 42%, transparent 74%);
}
```

Remove `overflow: hidden`, animated `width`, reveal-time `blur`, and reveal-time drop shadows. Apply only a restrained completed-state shadow:

```css
.guest-name-text.is-complete {
  filter: drop-shadow(0 0 5px rgba(253, 230, 138, 0.45)) !important;
}
```

- [ ] **Step 5: Build and verify the output contract is GREEN**

Run:

```powershell
npm.cmd run test:build
```

Expected: the existing routing tests and new greeting-layer test pass.

- [ ] **Step 6: Commit the stable visual layers**

```powershell
git add tests/build-output.test.mjs src/components/HeroSection.astro
git commit -m "style: refine handwritten greeting layers"
```

---

### Task 4: Bounded Pen-Glint Animation

**Files:**
- Modify: `src/components/HeroSection.astro`
- Test: `tests/handwriting.test.mjs`
- Test: `tests/performance.test.mjs`

**Interfaces:**
- Consumes: `easeHandwritingProgress`, `getMoteSpawnCount`, `handwritingMoteLimit`, and `handwritingCanvasDpr`.
- Owns: one animation-frame sequence, one fixed-size mote array, the glow visibility, and the canvas backing store.
- Preserves: the existing `scheduleHeroFrame`, `scheduleHeroTimeout`, `clearHeroScheduledWork`, and page lifecycle controller.

- [ ] **Step 1: Import the tested motion utilities**

At the top of the bundled hero script add:

```ts
import {
  easeHandwritingProgress,
  getMoteSpawnCount,
} from '../utils/handwriting';
```

- [ ] **Step 2: Replace the old frame-randomized sequence**

In `initFeatheredHandwritingSparkleReveal`, include `#guest-writing-glow` in the sequence and use a duration of `1500` milliseconds. On each frame:

```ts
const rawProgress = Math.min(1, Math.max(0, (now - startTime) / duration));
const progress = easeHandwritingProgress(rawProgress);
const edgeX = fullW * progress;

wrapper.style.setProperty('--reveal-position', `${progress * 100}%`);
wrapper.style.setProperty('--reveal-x', `${edgeX}px`);
glow.style.opacity = String(Math.sin(Math.PI * rawProgress) * 0.9);
```

Do not assign `textEl.style.width` inside the loop. Size the canvas once with `budget.handwritingCanvasDpr`, applying the existing horizontal and vertical padding.

- [ ] **Step 3: Render one glint and a capped mote pool**

Define motes with time-based fields:

```ts
interface Mote {
  bornAt: number;
  duration: number;
  originX: number;
  originY: number;
  driftX: number;
  driftY: number;
  size: number;
}
```

Draw the leading four-point glint directly at `edgeX + padX` while `rawProgress < 1`. Emit motes only when the edge has traveled far enough:

```ts
const spawnCount = getMoteSpawnCount(
  edgeX - lastEmissionX,
  budget.profile === 'mobile' ? 22 : 14,
  motes.length,
  budget.handwritingMoteLimit,
);
```

Use a small repeating offset pattern rather than per-frame randomness. Set `lastEmissionX = edgeX` after an emission batch. Remove expired motes by elapsed milliseconds, and stop scheduling frames after the reveal is complete and the pool is empty.

- [ ] **Step 4: Complete and release resources deterministically**

Create one local `finishSequence()` that:

```ts
wrapper.style.setProperty('--reveal-position', '100%');
wrapper.style.setProperty('--reveal-x', `${fullW}px`);
textEl.classList.remove('is-revealing');
textEl.classList.add('is-complete');
glow.style.opacity = '0';
ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
canvas.style.display = 'none';
canvas.width = 1;
canvas.height = 1;
motes.length = 0;
```

Use the same completed visual state for measurement failure and reduced motion, without requesting a canvas context in the reduced path. Extend `releaseSparkleCanvases()` so it also hides `#guest-writing-glow`.

- [ ] **Step 5: Verify unit tests, diagnostics, and production build**

Run sequentially:

```powershell
npm.cmd run test:unit
npm.cmd run astro -- check
npm.cmd run test:build
```

Expected: all unit and build-output tests pass, Astro reports zero errors, and all static routes build.

- [ ] **Step 6: Commit the animation engine**

```powershell
git add src/components/HeroSection.astro
git commit -m "feat: add bounded pen-glint reveal"
```

---

### Task 5: Local Motion and Lifecycle Verification

**Files:**
- Modify only if verification exposes a defect: `src/components/HeroSection.astro`, `src/utils/handwriting.ts`, or their focused tests

**Interfaces:**
- Verifies: generic and personalized landing routes, mobile profile, reduced motion, animation completion, and teardown.
- Produces: no deployment and no remote push.

- [ ] **Step 1: Start the required background server**

Run:

```powershell
.\node_modules\.bin\astro.cmd dev --background
.\node_modules\.bin\astro.cmd dev status
```

Use another available port only if Astro reports that `4321` is occupied by a different process.

- [ ] **Step 2: Inspect the personalized greeting at desktop and iPhone 13 dimensions**

Open `/lara-espanola` at `1280x800` and `390x844`. Verify:

- The exclamation mark and greeting layout do not shift during writing.
- No rectangular gold or blurred boundary appears at the reveal edge.
- The glow is elliptical and fully feathered.
- One glint leads the reveal and no more than two motes are visible on mobile.
- The effect finishes once, the canvas disappears, and the name retains only a subtle glow.

- [ ] **Step 3: Inspect reduced motion and lifecycle behavior**

Emulate `prefers-reduced-motion: reduce`, reload `/lara-espanola`, and verify the name is immediately complete with no glow canvas animation. Navigate away and back to exercise `pagehide`/`pageshow`; verify the page restores with a complete name and no restarted or duplicate animation.

- [ ] **Step 4: Check the background server logs**

Run:

```powershell
.\node_modules\.bin\astro.cmd dev logs
```

Expected: no runtime compilation errors or repeated client initialization errors.

- [ ] **Step 5: Run fresh final verification**

Run sequentially:

```powershell
npm.cmd run test:unit
npm.cmd run astro -- check
npm.cmd run test:build
git diff --check
git status --short
```

Expected: tests pass, Astro has zero errors, the production build completes, the diff has no whitespace errors, and the working tree is clean after any necessary fix commit.

- [ ] **Step 6: Keep the local server available for user review**

Report both Astro's localhost URL and its same-network URL. Do not run `git push`, `npm run deploy`, or `wrangler pages deploy`.
