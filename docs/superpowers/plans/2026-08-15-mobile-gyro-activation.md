# Mobile Gyro Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably activate layered portrait parallax from a sleek mobile motion button in iOS Chrome and Android Chrome.

**Architecture:** Keep browser-independent orientation mapping and lifecycle transitions in `landingScene.ts`. Keep DOM permission requests, sensor listeners, status UI, transforms, and teardown in `HeroSection.astro`, using the existing single input animation-frame pipeline.

**Tech Stack:** Astro 7, TypeScript, CSS, Device Orientation API, Node test runner

## Global Constraints

- Preserve desktop pointer parallax and the background/rear-magic/foreground/front-magic layer order.
- Preserve the existing `4px / 8px / 12px` depth offsets.
- Show the top-right icon jewel only on touch-capable mobile devices.
- Request iOS permission directly from the button's `click` handler.
- Do not activate gyro until a finite sensor reading arrives.
- Do not activate or display the control under reduced motion.
- Do not add dependencies, change invitation behavior, or deploy.

## File Structure

- `src/utils/landingScene.ts`: pure activation-state reducer, orientation validation, and viewport-relative orientation mapping.
- `tests/landing-scene.test.mjs`: unit coverage for activation transitions and portrait/landscape mapping.
- `src/components/HeroSection.astro`: semantic control, permission/event lifecycle, visual states, transform scheduling, and cleanup.
- `tests/build-output.test.mjs`: production-output assertions for the motion control's semantics and activation hooks.

---

### Task 1: Motion State And Screen-Aware Orientation Math

**Files:**
- Modify: `src/utils/landingScene.ts`
- Test: `tests/landing-scene.test.mjs`

**Interfaces:**
- Produces: `MotionActivationState`, `MotionActivationEvent`, `getNextMotionActivationState(state, event)`, `isValidOrientationReading(beta, gamma)`, and `normalizeOrientation(betaDelta, gammaDelta, screenAngle?)`.
- Consumes: the existing `ScenePointer` and `clampAxis()` utilities.

- [ ] **Step 1: Write failing lifecycle and axis-mapping tests**

```js
test("moves motion activation through request, reading, denial, and timeout states", () => {
  assert.equal(getNextMotionActivationState("idle", "request"), "requesting");
  assert.equal(getNextMotionActivationState("requesting", "reading"), "active");
  assert.equal(getNextMotionActivationState("requesting", "deny"), "denied");
  assert.equal(getNextMotionActivationState("requesting", "timeout"), "unavailable");
  assert.equal(getNextMotionActivationState("denied", "request"), "requesting");
});

test("validates finite orientation readings", () => {
  assert.equal(isValidOrientationReading(0, 0), true);
  assert.equal(isValidOrientationReading(null, 0), false);
  assert.equal(isValidOrientationReading(Number.NaN, 0), false);
});

test("maps orientation deltas into the current screen axes", () => {
  assert.deepEqual(normalizeOrientation(9, -18, 0), { x: -1, y: 0.5 });
  assert.deepEqual(normalizeOrientation(9, -18, 90), { x: 0.5, y: 1 });
  assert.deepEqual(normalizeOrientation(9, -18, 270), { x: -0.5, y: -1 });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test tests/landing-scene.test.mjs`

Expected: FAIL because the state types, reducer, reading validator, and third orientation argument do not exist.

- [ ] **Step 3: Implement the pure helpers**

```ts
export type MotionActivationState = "idle" | "requesting" | "active" | "denied" | "unavailable";
export type MotionActivationEvent = "request" | "reading" | "deny" | "timeout";

export function getNextMotionActivationState(
  state: MotionActivationState,
  event: MotionActivationEvent,
): MotionActivationState {
  if (event === "request" && state !== "active") return "requesting";
  if (state !== "requesting") return state;
  if (event === "reading") return "active";
  if (event === "deny") return "denied";
  if (event === "timeout") return "unavailable";
  return state;
}

export function isValidOrientationReading(
  beta: number | null,
  gamma: number | null,
): beta is number {
  return beta !== null && gamma !== null && Number.isFinite(beta) && Number.isFinite(gamma);
}

export function normalizeOrientation(
  betaDelta: number,
  gammaDelta: number,
  screenAngle = 0,
): ScenePointer {
  // Normalize the angle to 0/90/180/270 and rotate gamma/beta into viewport axes.
  // Divide the rotated axes by 18 and clamp through clampAxis().
}
```

Use exact quarter-turn branches so the tests do not depend on floating-point trigonometry:

```ts
const angle = ((Math.round(screenAngle / 90) * 90) % 360 + 360) % 360;
let x = gammaDelta;
let y = betaDelta;
if (angle === 90) [x, y] = [betaDelta, -gammaDelta];
if (angle === 180) [x, y] = [-gammaDelta, -betaDelta];
if (angle === 270) [x, y] = [-betaDelta, gammaDelta];
return { x: clampAxis(x / 18), y: clampAxis(y / 18) };
```

- [ ] **Step 4: Run the focused and complete unit suites and verify GREEN**

Run: `node --experimental-strip-types --test tests/landing-scene.test.mjs`

Expected: all landing-scene tests PASS.

Run: `npm.cmd run test:unit`

Expected: all unit tests PASS.

- [ ] **Step 5: Commit the pure motion model**

```powershell
git add -- src/utils/landingScene.ts tests/landing-scene.test.mjs
git commit -m "fix: model reliable mobile motion input"
```

---

### Task 2: Mobile Motion Control And Browser Lifecycle

**Files:**
- Modify: `src/components/HeroSection.astro`
- Test: `tests/build-output.test.mjs`

**Interfaces:**
- Consumes: `MotionActivationState`, `getNextMotionActivationState`, `isValidOrientationReading`, and `normalizeOrientation` from Task 1.
- Produces: `#scene-motion-button`, `#scene-motion-status`, direct-click permission activation, valid-reading confirmation, screen recalibration, and complete teardown.

- [ ] **Step 1: Write failing production-output assertions**

Extend the layered-scene build test with:

```js
assert.match(html, /id="scene-motion-button"/);
assert.match(html, /type="button"/);
assert.match(html, /aria-label="Enable motion effect"/);
assert.match(html, /id="scene-motion-status"[^>]*role="status"/);
assert.match(html, /requestPermission/);
assert.match(html, /deviceorientation/);
```

- [ ] **Step 2: Build and verify RED**

Run: `npm.cmd run test:build`

Expected: FAIL because the semantic motion control is absent from built landing pages.

- [ ] **Step 3: Add the semantic top-right icon jewel**

Place the button and live status after the front magic canvas inside `.portrait-stage`:

```astro
<button id="scene-motion-button" class="scene-motion-button" type="button" aria-label="Enable motion effect" aria-describedby="scene-motion-status" hidden>
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <span class="scene-motion-hint">Enable motion</span>
</button>
<span id="scene-motion-status" class="scene-motion-status" role="status" aria-live="polite"></span>
```

Style it as the selected option B: a 36px circular glass button at `top: 12px; right: 12px`, gold border/icon, blurred navy background, visible `:focus-visible` ring, and a hint that collapses after its introductory animation. Keep the control above the vignette and below the letter overlay. Add state selectors for `requesting`, `active`, `denied`, and `unavailable`; fade it only after `active`.

- [ ] **Step 4: Replace generic portrait activation with direct button activation**

Import the Task 1 helpers and add:

```ts
let sceneMotionState: MotionActivationState = "idle";
let sceneMotionButton: HTMLButtonElement | null = null;
let sceneMotionStatus: HTMLElement | null = null;
let sceneOrientationProbeTimeout: number | null = null;

function setSceneMotionState(next: MotionActivationState) {
  sceneMotionState = next;
  if (sceneMotionButton) {
    sceneMotionButton.dataset.state = next;
    sceneMotionButton.disabled = next === "requesting" || next === "active";
    sceneMotionButton.setAttribute("aria-pressed", String(next === "active"));
  }
  if (sceneMotionStatus) {
    sceneMotionStatus.textContent = next === "requesting"
      ? "Waiting for motion access"
      : next === "active"
        ? "Motion effect enabled"
        : next === "denied"
          ? "Motion access was not allowed"
          : next === "unavailable"
            ? "Motion is unavailable on this device"
            : "";
  }
}
```

Use a direct click handler:

```ts
async function requestSceneOrientationPermission() {
  if (sceneDestroyed || sceneMotionState === "requesting" || sceneMotionState === "active") return;
  setSceneMotionState(getNextMotionActivationState(sceneMotionState, "request"));
  const constructor = window.DeviceOrientationEvent as OrientationEventConstructor | undefined;
  if (!window.isSecureContext || !constructor) {
    setSceneMotionState(getNextMotionActivationState(sceneMotionState, "timeout"));
    return;
  }
  try {
    const permission = typeof constructor.requestPermission === "function"
      ? await constructor.requestPermission()
      : "granted";
    if (permission !== "granted") {
      setSceneMotionState(getNextMotionActivationState(sceneMotionState, "deny"));
      return;
    }
    attachSceneOrientation();
    startSceneOrientationProbe();
  } catch {
    setSceneMotionState(getNextMotionActivationState(sceneMotionState, "deny"));
  }
}
```

The click handler must invoke `requestPermission()` before any unrelated asynchronous work. Do not retain the portrait `pointerup` listener.

- [ ] **Step 5: Confirm readings, map screen axes, and recalibrate**

In `handleSceneOrientation`, reject readings through `isValidOrientationReading`. Use the first valid event as the neutral baseline, transition to `active`, clear the probe timeout, and use subsequent events with:

```ts
const pointer = normalizeOrientation(
  event.beta - sceneOrientationBaselineBeta,
  event.gamma - sceneOrientationBaselineGamma,
  getSceneScreenAngle(),
);
```

Read `screen.orientation?.angle` with `window.orientation` as the iOS fallback. Reset both baseline values on screen `change`/`orientationchange` and whenever the document becomes visible. Keep the current smoothing and the existing `4px / 8px / 12px` transforms.

- [ ] **Step 6: Add failure timeout, reduced-motion gating, and teardown**

Reveal the control only when `navigator.maxTouchPoints > 0` or `(pointer: coarse)` matches, the scene is animated, and the page is not opening/destroyed. Start a 3000ms probe after listener attachment. On timeout, transition to `unavailable`, detach the orientation listener, and show `Motion is unavailable on this device`. On explicit denial show `Motion access was not allowed`.

During teardown, clear the probe timeout and remove the button click, orientation, screen-orientation, fallback orientation-change, and visibility listeners. Reset references to `null`.

- [ ] **Step 7: Run build and all verification**

Run: `npm.cmd run test:build`

Expected: build-output tests PASS.

Run: `npm.cmd run test:unit`

Expected: all unit tests PASS.

Run: `npm.cmd run astro -- check`

Expected: zero errors.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 8: Manually verify on physical devices over HTTPS**

- iOS Chrome: tapping the icon shows the native permission prompt; granting activates distinct layer motion.
- Android Chrome: tapping the icon activates after the first finite sensor event.
- Denial and timeout remain non-blocking and display concise guidance.
- Reduced motion hides the control; desktop pointer parallax is unchanged.

- [ ] **Step 9: Commit the browser integration**

```powershell
git add -- src/components/HeroSection.astro tests/build-output.test.mjs
git commit -m "fix: activate gyro parallax from mobile control"
```
