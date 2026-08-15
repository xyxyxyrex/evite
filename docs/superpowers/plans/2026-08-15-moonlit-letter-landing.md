# Moonlit Letter Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense splash cards with a concise moonlit letter and layered Isabel portrait scene, then open the invitation with an optimized enchanted-unsealing transition.

**Architecture:** Pure utilities provide deterministic parallax offsets and shared rendering budgets. `HeroSection.astro` owns a fixed-aspect scene composed of Astro-optimized background and transparent foreground images, one bounded sparkle canvas between them, one semantic letter, and one compositor-friendly transition controller.

**Tech Stack:** Astro 7, TypeScript, Node test runner, Astro Assets, Canvas 2D, CSS masks/transforms/animations

## Global Constraints

- Visible landing copy is limited to `Hi, <guest>`, `You are invited to:`, `Isabel, Once Upon Eighteen`, and `Accept Invitation & Open`.
- Use serif for labels and `Once Upon Eighteen`; use cursive for the guest name and `Isabel,`.
- Preserve the existing fixed-layout handwriting reveal, tracking request, background audio, guest routing, RSVP flow, and revealed invitation.
- Use `src/assets/parallax/background.png` below the sparkle canvas and `src/assets/parallax/foreground.png` above it.
- Maximum parallax distances are `4px` background, `8px` sparkles, and `12px` foreground.
- Sparkle budgets are 12 at 30 fps and DPR 1.5 desktop, 6 at 20 fps and DPR 1 mobile, and no canvas loop under reduced motion.
- The enchanted-unsealing transition lasts about `900ms`; reduced motion uses a short crossfade.
- Do not animate layout, large blur filters, or unbounded particle arrays.
- At `390x844`, the letter, acceptance button, and part of Isabel's portrait must share the first viewport without overlap over her face.
- Use direct `master` commits as approved. Do not push, deploy, or run the Cloudflare deploy script.

---

### Task 1: Scene Math and Rendering Budgets

**Files:**
- Create: `src/utils/landingScene.ts`
- Create: `tests/landing-scene.test.mjs`
- Modify: `src/utils/performance.ts`
- Modify: `tests/performance.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `ScenePointer = { x: number; y: number }` with each axis in `[-1, 1]`.
- Produces: `normalizeScenePointer(clientX, clientY, left, top, width, height): ScenePointer`.
- Produces: `getSceneOffsets(pointer): { background: ScenePointer; sparkles: ScenePointer; foreground: ScenePointer }` using exact `4`, `8`, and `12` pixel multipliers.
- Extends: `RenderingBudget` with `sceneSparkleCount`, `sceneSparkleFps`, `sceneCanvasDpr`, and `transitionMotes`.

- [ ] **Step 1: Add failing scene-math tests**

Create `tests/landing-scene.test.mjs`:

```js
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
```

Add `tests/landing-scene.test.mjs` to `test:unit` in `package.json`.

- [ ] **Step 2: Extend expected rendering budgets before production code**

Add these literal fields to the full/mobile/reduced `deepEqual` expectations in `tests/performance.test.mjs`:

```js
// Full
sceneSparkleCount: 12,
sceneSparkleFps: 30,
sceneCanvasDpr: 1.5,
transitionMotes: 12,

// Mobile
sceneSparkleCount: 6,
sceneSparkleFps: 20,
sceneCanvasDpr: 1,
transitionMotes: 6,

// Reduced
sceneSparkleCount: 0,
sceneSparkleFps: 0,
sceneCanvasDpr: 0,
transitionMotes: 0,
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/landing-scene.test.mjs tests/performance.test.mjs
```

Expected: FAIL because `landingScene.ts` and the new budget fields do not exist.

- [ ] **Step 4: Implement deterministic scene math**

Create `src/utils/landingScene.ts`:

```ts
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
```

- [ ] **Step 5: Extend `RenderingBudget`**

Add the four fields to the interface and the exact full/mobile/reduced values declared above to all three budget constants in `src/utils/performance.ts`.

- [ ] **Step 6: Run the full unit suite and verify GREEN**

Run:

```powershell
npm.cmd run test:unit
```

Expected: all guest, handwriting, performance, and landing-scene tests pass.

- [ ] **Step 7: Commit the scene contract**

```powershell
git add package.json src/utils/landingScene.ts src/utils/performance.ts tests/landing-scene.test.mjs tests/performance.test.mjs
git commit -m "test: define landing scene motion budgets"
```

---

### Task 2: Responsive Letter and Portrait Scene

**Files:**
- Modify: `tests/build-output.test.mjs`
- Modify: `src/components/HeroSection.astro`
- Add: `src/assets/parallax/background.png`
- Add: `src/assets/parallax/foreground.png`

**Interfaces:**
- Produces: `#moonlit-letter`, `#portrait-stage`, `#scene-background`, `#scene-sparkles`, and `#scene-foreground`.
- Preserves: `#guest-wrapper`, `#guest-name-reveal`, `#guest-writing-glow`, `#guest-sparkle-canvas`, and `#accept-invitation-btn`.
- Consumes: both matching `1024x1536` source assets through Astro's `Image` component.

- [ ] **Step 1: Add a failing production-output contract**

Add to `tests/build-output.test.mjs`:

```js
test("landing emits the concise moonlit letter and layered portrait scene", () => {
  const html = readFileSync("dist/lara-espanola/index.html", "utf8");
  assert.match(html, /id="moonlit-letter"/);
  assert.match(html, /id="portrait-stage"/);
  assert.match(html, /id="scene-background"/);
  assert.match(html, /id="scene-sparkles"/);
  assert.match(html, /id="scene-foreground"/);
  assert.match(html, /You are invited to:/i);
  assert.match(html, /Once Upon Eighteen/);
  assert.doesNotMatch(html, /An 18th Birthday Debut Celebration/);
  assert.doesNotMatch(html, /cordially requests your presence/);
  assert.doesNotMatch(html, /You are invited to my 18th Birthday Debut!/);
});
```

- [ ] **Step 2: Build and verify RED**

Run:

```powershell
npm.cmd run test:build
```

Expected: FAIL because the new scene IDs and concise title are absent.

- [ ] **Step 3: Replace the splash markup**

In the Astro frontmatter, replace `LandingPage.jpg` with:

```ts
import parallaxBackground from '../assets/parallax/background.png';
import parallaxForeground from '../assets/parallax/foreground.png';
```

Replace the two-card splash body with this semantic structure while retaining existing button data attributes and handwriting layers:

```astro
<div id="splash-screen" class="splash-overlay">
  <div class="landing-scene">
    <section class="moonlit-letter" id="moonlit-letter" aria-labelledby="landing-title">
      <span class="letter-star letter-star-left" aria-hidden="true">✦</span>
      <span class="letter-star letter-star-right" aria-hidden="true">✦</span>

      <h1 class="guest-greeting font-serif">
        <span>Hi,</span>
        <span class="guest-sparkle-wrapper inline-reveal-wrapper" id="guest-wrapper">
          <span class="guest-name-text font-cursive inline-reveal-text" id="guest-name-reveal">{guestInfo.rawName}</span>
          <span class="guest-writing-glow" id="guest-writing-glow" aria-hidden="true"></span>
          <canvas class="sparkle-leading-canvas" id="guest-sparkle-canvas" aria-hidden="true"></canvas>
        </span>
      </h1>

      <div class="letter-rule" aria-hidden="true"><span>✦</span></div>
      <p class="invitation-label font-serif">You are invited to:</p>
      <h2 class="event-title" id="landing-title">
        <span class="event-name font-cursive">Isabel,</span>
        <span class="event-theme font-serif">Once Upon Eighteen</span>
      </h2>

      <button class="btn-gold btn-reveal" id="accept-invitation-btn" data-guest-name={guestInfo.rawName} data-guest-role={guestInfo.role}>
        <span>Accept Invitation & Open</span>
        <span aria-hidden="true">✦</span>
      </button>
    </section>

    <figure class="portrait-stage" id="portrait-stage" aria-label="Portrait of Isabel">
      <Image id="scene-background" class="scene-layer scene-background" src={parallaxBackground} alt="" width={1024} quality={76} format="webp" loading="eager" fetchpriority="high" />
      <canvas id="scene-sparkles" class="scene-layer scene-sparkles" aria-hidden="true"></canvas>
      <Image id="scene-foreground" class="scene-layer scene-foreground" src={parallaxForeground} alt="Isabel in a violet debut gown" width={1024} quality={82} format="webp" loading="eager" fetchpriority="high" />
      <div class="scene-vignette" aria-hidden="true"></div>
    </figure>
  </div>
</div>
```

- [ ] **Step 4: Replace obsolete splash CSS with the responsive composition**

Keep the fixed-layout handwriting selectors, then replace the old ornate-card, split-card, photo-frame, crest, botanical, redundant typography, and old opening-transition styles.

Implement these layout invariants:

```css
.splash-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  min-height: 100dvh;
  overflow: hidden;
  background: #050914;
  padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
}

.landing-scene {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(340px, 0.92fr);
  width: min(1180px, 100%);
  height: 100%;
  margin: 0 auto;
  isolation: isolate;
}

.portrait-stage {
  position: relative;
  grid-column: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  background: #10170d;
}

.scene-layer {
  position: absolute;
  inset: -14px;
  width: calc(100% + 28px);
  height: calc(100% + 28px);
  object-fit: cover;
  object-position: center center;
  transform: translate3d(var(--scene-x, 0), var(--scene-y, 0), 0);
}

.scene-background { z-index: 0; }
.scene-sparkles { z-index: 1; pointer-events: none; }
.scene-foreground { z-index: 2; }
.scene-vignette { position: absolute; inset: 0; z-index: 3; pointer-events: none; }

.moonlit-letter {
  position: relative;
  z-index: 5;
  grid-column: 2;
  align-self: center;
  margin-left: clamp(-42px, -3vw, -18px);
  padding: 40px 34px 34px;
  text-align: center;
  color: #fff8dc;
  background-color: rgba(7, 13, 31, 0.92);
  border: 1px solid rgba(224, 188, 75, 0.72);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42), inset 0 0 32px rgba(218, 180, 74, 0.07);
}
```

Use a pseudo-element for the inner gold hairline and a low-opacity noise texture made from CSS background data only on the letter. Keep card corner radius at `6px` or below.

At `max-width: 899px`, use a two-row composition with the letter first and portrait second. The letter occupies at most `42dvh`, the portrait fills the remaining space, and their overlap is `16px` to `24px`. At `390x844`, constrain heading and button sizes with fixed media-query values so all copy and the button fit without internal scrolling. Ensure the portrait image's face stays below the letter overlap.

- [ ] **Step 5: Build and verify GREEN**

Run:

```powershell
npm.cmd run test:build
npm.cmd run astro -- check
```

Expected: all build-output tests pass and Astro reports zero errors.

- [ ] **Step 6: Commit the responsive scene**

```powershell
git add src/assets/parallax/background.png src/assets/parallax/foreground.png src/components/HeroSection.astro tests/build-output.test.mjs
git commit -m "feat: build moonlit letter landing scene"
```

---

### Task 3: Bounded Parallax and Depth Sparkles

**Files:**
- Modify: `src/components/HeroSection.astro`

**Interfaces:**
- Consumes: `normalizeScenePointer`, `getSceneOffsets`, and scene fields from `getRenderingBudget`.
- Owns: one passive pointer listener, one input RAF gate, one sparkle RAF chain, one resize listener, one visibility listener, and a fixed sparkle array.
- Produces: idempotent `destroyLandingScene()` called by the existing hero teardown.

- [ ] **Step 1: Import the tested scene utilities**

Add to the bundled hero script:

```ts
import { getSceneOffsets, normalizeScenePointer } from '../utils/landingScene';
```

- [ ] **Step 2: Add the scene resource controller**

Create controller-owned state near the existing hero resource state:

```ts
let sceneInputFrame = 0;
let sceneSparkleFrame = 0;
let sceneDestroyed = false;
let sceneVisible = !document.hidden;
let sceneSparkles: SceneSparkle[] = [];
```

Define each `SceneSparkle` once with normalized `x`, `y`, `radius`, `phase`, and `speed`. Generate exactly `budget.sceneSparkleCount` entries during initialization; never push from the render loop.

- [ ] **Step 3: Implement input-driven parallax**

Attach one passive `pointermove` listener to `#portrait-stage`. In the handler, retain the most recent pointer coordinates and schedule `sceneInputFrame` only when one is not pending. In that frame:

```ts
const rect = stage.getBoundingClientRect();
const pointer = normalizeScenePointer(clientX, clientY, rect.left, rect.top, rect.width, rect.height);
const offsets = getSceneOffsets(pointer);
background.style.setProperty('--scene-x', `${offsets.background.x}px`);
background.style.setProperty('--scene-y', `${offsets.background.y}px`);
canvas.style.setProperty('--scene-x', `${offsets.sparkles.x}px`);
canvas.style.setProperty('--scene-y', `${offsets.sparkles.y}px`);
foreground.style.setProperty('--scene-x', `${offsets.foreground.x}px`);
foreground.style.setProperty('--scene-y', `${offsets.foreground.y}px`);
```

Skip listener registration when the profile is reduced. On `pointerleave`, return the three layers to zero with the same RAF gate.

- [ ] **Step 4: Implement the fixed sparkle loop**

Size the canvas from the stage rectangle with `budget.sceneCanvasDpr`. Render only when the elapsed time exceeds `1000 / budget.sceneSparkleFps`. For each existing sparkle, calculate opacity and scale from the RAF timestamp and its fixed phase; draw a warm circular point, with every fourth entry using a small four-point glint.

Do not allocate arrays or objects in `renderSceneSparkles`. Stop scheduling while `document.hidden`. On visibility return, schedule exactly one frame only if the controller is not destroyed.

- [ ] **Step 5: Integrate cleanup**

`destroyLandingScene()` must:

```ts
sceneDestroyed = true;
stage.removeEventListener('pointermove', handleScenePointer);
stage.removeEventListener('pointerleave', resetScenePointer);
window.removeEventListener('resize', resizeSceneCanvas);
document.removeEventListener('visibilitychange', handleSceneVisibility);
if (sceneInputFrame) cancelAnimationFrame(sceneInputFrame);
if (sceneSparkleFrame) cancelAnimationFrame(sceneSparkleFrame);
sceneInputFrame = 0;
sceneSparkleFrame = 0;
sceneSparkles.length = 0;
canvas.width = 1;
canvas.height = 1;
```

Call it from the existing normal page teardown. On BFCache page hide, pause frames and reset layer transforms; restoration may resume one sparkle loop without registering listeners again.

- [ ] **Step 6: Verify the scene controller**

Run:

```powershell
npm.cmd run test:unit
npm.cmd run astro -- check
npm.cmd run test:build
```

Expected: all tests pass, Astro reports zero errors, and all static pages build.

- [ ] **Step 7: Commit the depth effect**

```powershell
git add src/components/HeroSection.astro
git commit -m "feat: add bounded portrait depth effects"
```

---

### Task 4: Enchanted Unsealing Transition

**Files:**
- Modify: `tests/build-output.test.mjs`
- Modify: `src/components/HeroSection.astro`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `#opening-veil`, `.letter-border-trace`, and a fixed set of `.unseal-mote` decorative spans.
- Consumes: `budget.transitionMotes` and the existing acceptance button, tracking, audio, and content reveal elements.
- Removes: runtime and package dependency on `canvas-confetti`.

- [ ] **Step 1: Add a failing output test for unsealing layers**

Add to `tests/build-output.test.mjs`:

```js
test("landing emits the enchanted unsealing layers", () => {
  const html = readFileSync("dist/lara-espanola/index.html", "utf8");
  assert.match(html, /id="opening-veil"/);
  assert.match(html, /class="letter-border-trace"/);
  assert.match(html, /class="unseal-motes"/);
});
```

- [ ] **Step 2: Build and verify RED**

Run:

```powershell
npm.cmd run test:build
```

Expected: FAIL because the unsealing layers are absent.

- [ ] **Step 3: Add bounded transition markup**

Inside `#moonlit-letter`, add one decorative `.letter-border-trace`. Add one `.unseal-motes` container with 12 empty `span.unseal-mote` children after the letter; JavaScript will hide entries above `budget.transitionMotes`. Add `#opening-veil` as the last child of `#splash-screen`.

Every decorative element must use `aria-hidden="true"` and must not contain visible text.

- [ ] **Step 4: Replace the acceptance animation**

Remove the `canvas-confetti` import and call. Preserve tracking and `startBackgroundAudio()` inside the click handler.

On activation:

```ts
btn.disabled = true;
splash.classList.add(budget.profile === 'reduced' ? 'opening-reduced' : 'opening-enchanted');
document.querySelectorAll<HTMLElement>('.unseal-mote').forEach((mote, index) => {
  mote.hidden = index >= budget.transitionMotes;
});
mainContent?.classList.remove('hidden-main');
mainContent?.classList.add('revealed-active');
```

Use one tracked `900ms` timeout for normal/mobile profiles and `180ms` for reduced motion. At timeout, mark the splash dismissed, set `display: none`, unlock body scrolling, reset the scene canvas to `1x1`, and call the normal scene teardown. Keep the click listener `{ once: true }`.

- [ ] **Step 5: Implement compositor-friendly CSS**

Use `.opening-enchanted` to animate:

- `.letter-border-trace`: a single `900ms` border-light pass.
- `.moonlit-letter`: `transform: translate3d(0, -10px, 0) scale(0.985)` and opacity to zero after the border pass begins.
- `.unseal-mote`: fixed predeclared custom directions, opacity, and transform only.
- `.scene-foreground`: a subtle scale/translate advance no larger than `1.025` and `8px`.
- `.opening-veil`: one opacity/transform sweep that reveals the already-visible main content.

Do not animate `filter`, `backdrop-filter`, width, height, top, or left. Under `html[data-rendering-profile="reduced"]`, hide border trace and motes and use only the `180ms` splash opacity crossfade.

- [ ] **Step 6: Remove the obsolete dependency**

Run:

```powershell
npm.cmd uninstall canvas-confetti @types/canvas-confetti
```

Confirm `package.json` and `package-lock.json` no longer include either package and `rg "canvas-confetti|confetti\(" src package.json package-lock.json` returns no matches.

- [ ] **Step 7: Verify GREEN**

Run:

```powershell
npm.cmd run test:unit
npm.cmd run astro -- check
npm.cmd run test:build
```

Expected: all tests pass, Astro reports zero errors, and the build-output test sees every unsealing layer.

- [ ] **Step 8: Commit the enchanted transition**

```powershell
git add package.json package-lock.json src/components/HeroSection.astro tests/build-output.test.mjs
git commit -m "feat: add enchanted invitation unsealing"
```

---

### Task 5: Responsive Visual and Lifecycle Verification

**Files:**
- Modify only when a verified defect requires it: the focused source file and its existing test
- Store screenshots only under: `.superpowers/sdd/2026-08-15-moonlit-letter-landing/`

**Interfaces:**
- Verifies: generic/personalized copy, desktop/mobile composition, long-name wrapping, reduced motion, parallax idling, transition completion, and resource cleanup.
- Produces: a running local Astro server for user review; no remote push or deployment.

- [ ] **Step 1: Start or reuse the required background server**

Run:

```powershell
.\node_modules\.bin\astro.cmd dev status
.\node_modules\.bin\astro.cmd dev --background
```

Run the second command only when status reports no server. Use another port only if `4321` belongs to a different project.

- [ ] **Step 2: Capture and inspect desktop and mobile views**

Use available Chromium/Edge or browser tooling to inspect:

- `/` at `390x844` for the `Honored Guest` fallback.
- `/lara-espanola` at `390x844` for a typical personalized route.
- `/johnezza-veronic-tolentino` at `390x844` for long-name wrapping.
- `/lara-espanola` at `1280x800` for the desktop composition.

Capture screenshots in the task workspace and inspect them. Confirm the letter/button/portrait share the first viewport, no text overlaps Isabel's face, the two images align, no transparent edge is exposed, and no text or controls clip.

- [ ] **Step 3: Exercise motion and reduced motion**

Where browser tooling permits, verify pointer input moves the background/sparkles/foreground within `4/8/12px`, becomes idle afterward, and never moves under reduced motion. Confirm desktop shows at most 12 sparkles, mobile at most 6, and hidden-document restoration does not create a second loop.

Activate the button and inspect the mid-transition and completed states. Verify tracking/audio attempts still originate from the click, the old confetti and blur-slide are absent, the main content becomes visible, and the splash/canvas are released after completion. Under reduced motion, verify the short crossfade and absence of motes.

- [ ] **Step 4: Check runtime logs**

Run:

```powershell
.\node_modules\.bin\astro.cmd dev logs
```

Expected: no compilation failures, repeated initialization errors, or uncaught client exceptions.

- [ ] **Step 5: Run fresh final verification**

Run sequentially:

```powershell
npm.cmd run test:unit
npm.cmd run astro -- check
npm.cmd run test:build
git diff --check
git status --short
```

Expected: all tests pass, Astro reports zero errors, 148 pages build, no whitespace errors exist, and the working tree is clean after any required fix commit.

- [ ] **Step 6: Keep the server available**

Report Astro's localhost and same-network URLs. Do not run `git push`, `npm run deploy`, or `wrangler pages deploy`.
