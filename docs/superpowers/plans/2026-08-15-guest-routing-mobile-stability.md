# Guest Routing and Mobile Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize the invitation roster, redirect unknown Cloudflare Pages URLs to the generic invitation, and reduce mobile Safari rendering pressure without redesigning or deploying the site.

**Architecture:** Astro continues to generate a static page for every supported guest alias from one roster in `src/utils/guests.ts`. A static `404.html` handles unknown paths. A pure rendering-profile utility supplies shared effect budgets, while individual components retain ownership of their canvas, timer, audio, image, and event-listener cleanup.

**Tech Stack:** Astro 7, TypeScript, Node test runner, Cloudflare Pages static hosting, Canvas 2D, Astro Assets

## Global Constraints

- Do not run `wrangler pages deploy` or otherwise update the live Cloudflare Pages project.
- Do not change the Google Apps Script endpoint or `no-cors` RSVP behavior.
- Do not add opt-out flags, filtering, an admin UI, SSR, Pages Functions, authentication, or a database.
- Preserve the existing layout, gallery, music, content, reveal interaction, and visual identity.
- `src/utils/guests.ts` is the only guest roster and lookup source.
- Mobile means a viewport below 768 CSS pixels; reduced motion takes priority over viewport width.

---

### Task 1: Guest Alias Contract

**Files:**
- Create: `tests/guests.test.ts`
- Modify: `package.json`
- Modify: `src/utils/guests.ts`
- Modify: `src/pages/[guest].astro`

**Interfaces:**
- Produces: `getGuestRouteAliases(name: string): string[]` in `src/utils/guests.ts`.
- Produces: `npm run test:unit`, which runs TypeScript unit tests with Node's test runner.
- Consumes: Existing `GUESTS_DATA`, `getGuestInfo`, `toHyphenatedSlug`, and `toCompactSlug`.

- [ ] **Step 1: Add the unit-test command and failing alias tests**

Add this script to `package.json`:

```json
"test:unit": "node --experimental-strip-types --test tests/guests.test.ts"
```

Create `tests/guests.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  GUESTS_DATA,
  getGuestInfo,
  getGuestRouteAliases,
} from "../src/utils/guests.ts";

test("normalizes accented names without producing malformed aliases", () => {
  assert.deepEqual(getGuestRouteAliases("Lara Española"), [
    "lara-espanola",
    "laraespanola",
  ]);
});

test("deduplicates aliases case-insensitively", () => {
  const aliases = getGuestRouteAliases("JV Esoy");
  assert.equal(new Set(aliases.map((alias) => alias.toLowerCase())).size, aliases.length);
  assert.deepEqual(aliases, ["jv-esoy", "jvesoy"]);
});

test("resolves every canonical roster name to its declared role", () => {
  for (const [role, names] of Object.entries(GUESTS_DATA)) {
    for (const name of names) {
      const guest = getGuestInfo(name);
      assert.equal(guest.rawName, name);
      assert.equal(guest.role, role);
    }
  }
});
```

- [ ] **Step 2: Run the guest tests and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/guests.test.ts
```

Expected: FAIL because `getGuestRouteAliases` is not exported.

- [ ] **Step 3: Implement normalized, deduplicated aliases**

Add to `src/utils/guests.ts`:

```ts
export function getGuestRouteAliases(name: string): string[] {
  const candidates = [toHyphenatedSlug(name), toCompactSlug(name)];
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = candidate.toLowerCase();
    if (!candidate || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

Change `src/pages/[guest].astro` to iterate `getGuestRouteAliases(name)` and remove the separate CamelCase branch. Keep the two demo aliases.

- [ ] **Step 4: Run the guest tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --test tests/guests.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit the alias contract**

```powershell
git add package.json tests/guests.test.ts src/utils/guests.ts src/pages/[guest].astro
git commit -m "refactor: centralize guest route aliases"
```

### Task 2: One Runtime Guest Source and Static Fallback

**Files:**
- Create: `src/pages/404.astro`
- Create: `tests/build-output.test.mjs`
- Modify: `package.json`
- Modify: `src/components/HeroSection.astro`
- Modify: `src/components/RSVPModal.astro`

**Interfaces:**
- Consumes: Server-rendered `guestInfo`, `guestName`, and `role` props.
- Produces: `dist/404.html`, which replaces the current Cloudflare Pages implicit SPA fallback and sends users to `/`.
- Produces: `npm run test:build`, which builds and tests observable static output.

- [ ] **Step 1: Add a failing production-output test**

Add this script to `package.json`:

```json
"test:build": "npm run build && node --test tests/build-output.test.mjs"
```

Create `tests/build-output.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("build emits a static fallback that redirects unknown routes to root", () => {
  assert.equal(existsSync("dist/404.html"), true);
  const html = readFileSync("dist/404.html", "utf8");
  assert.match(html, /location\.replace\(["']\/["']\)/);
  assert.match(html, /href=["']\/["']/);
});

test("build emits the canonical accented guest route only", () => {
  assert.equal(existsSync("dist/lara-espanola/index.html"), true);
  assert.equal(existsSync("dist/laraespanola/index.html"), true);
  assert.equal(existsSync("dist/LaraEspaola/index.html"), false);
});
```

- [ ] **Step 2: Run the build-output test and verify RED**

Run:

```powershell
npm.cmd run test:build
```

Expected: FAIL because `dist/404.html` does not exist.

- [ ] **Step 3: Add the static redirect page**

Create `src/pages/404.astro` as a minimal accessible document. Its `<head>` must include a canonical URL and immediate meta refresh, and its inline script must call `window.location.replace('/')`. Its body must contain an ordinary `/` link for visitors without JavaScript.

- [ ] **Step 4: Remove duplicated browser guest maps**

In `HeroSection.astro`, delete `resolveLiveGuestInfo`, `syncLiveGuestData`, `GUESTS_MAP`, and their `pageshow`/ready calls. Keep the existing server-rendered button data attributes and event tracking.

In `RSVPModal.astro`, delete `resolveLiveGuestInfo`, `syncLiveRSVPData`, `GUESTS_MAP`, and their `pageshow`/ready calls. Keep the server-rendered form values and RSVP submission behavior.

- [ ] **Step 5: Run unit and build-output tests and verify GREEN**

Run sequentially:

```powershell
npm.cmd run test:unit
npm.cmd run test:build
```

Expected: all unit tests pass; both build-output tests pass.

- [ ] **Step 6: Commit the static fallback and runtime simplification**

```powershell
git add package.json tests/build-output.test.mjs src/pages/404.astro src/components/HeroSection.astro src/components/RSVPModal.astro
git commit -m "fix: route unknown invitations to honored guest"
```

### Task 3: Shared Rendering Budgets

**Files:**
- Create: `tests/performance.test.ts`
- Create: `src/utils/performance.ts`
- Create: `src/components/PerformanceProfile.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/[guest].astro`

**Interfaces:**
- Produces: `RenderingProfile = "full" | "mobile" | "reduced"`.
- Produces: `getRenderingBudget(viewportWidth: number, reducedMotion: boolean): RenderingBudget`.
- Produces: `data-rendering-profile` on `<html>` for CSS consumers.

- [ ] **Step 1: Write failing rendering-budget tests**

Create `tests/performance.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getRenderingBudget } from "../src/utils/performance.ts";

test("uses full animation budgets on desktop", () => {
  assert.deepEqual(getRenderingBudget(1280, false), {
    profile: "full",
    starCount: 80,
    starfieldFps: 60,
    handwritingParticleScale: 1,
    confettiParticles: 180,
  });
});

test("caps animation budgets on mobile", () => {
  assert.deepEqual(getRenderingBudget(390, false), {
    profile: "mobile",
    starCount: 20,
    starfieldFps: 20,
    handwritingParticleScale: 0.4,
    confettiParticles: 40,
  });
});

test("reduced motion disables continuous and particle animation", () => {
  assert.deepEqual(getRenderingBudget(1280, true), {
    profile: "reduced",
    starCount: 0,
    starfieldFps: 0,
    handwritingParticleScale: 0,
    confettiParticles: 0,
  });
});
```

Update the `test:unit` script so it runs both unit-test files:

```json
"test:unit": "node --experimental-strip-types --test tests/guests.test.ts tests/performance.test.ts"
```

- [ ] **Step 2: Run the performance tests and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/performance.test.ts
```

Expected: FAIL because `src/utils/performance.ts` does not exist.

- [ ] **Step 3: Implement the pure rendering profile**

Create `src/utils/performance.ts` with the exported type, budget interface, literal full/mobile/reduced budgets, and `getRenderingBudget`. Validate non-finite or negative widths by treating them as mobile so malformed input cannot accidentally enable the most expensive profile.

- [ ] **Step 4: Expose the profile to component CSS**

Create `PerformanceProfile.astro` with a bundled script that calls `getRenderingBudget(window.innerWidth, window.matchMedia('(prefers-reduced-motion: reduce)').matches)` and writes `document.documentElement.dataset.renderingProfile`. Listen for motion-preference changes and remove that listener on `pagehide`.

Render the component once in both page documents before visual components initialize.

- [ ] **Step 5: Run the unit suite and verify GREEN**

Run:

```powershell
npm.cmd run test:unit
```

Expected: all 6 tests pass.

- [ ] **Step 6: Commit the shared rendering profile**

```powershell
git add tests/performance.test.ts src/utils/performance.ts src/components/PerformanceProfile.astro src/pages/index.astro src/pages/[guest].astro
git commit -m "feat: define mobile rendering budgets"
```

### Task 4: Canvas, Particles, Audio, and Timer Lifecycle

**Files:**
- Modify: `src/components/StarfieldCanvas.astro`
- Modify: `src/components/HeroSection.astro`
- Modify: `src/components/CountdownTimer.astro`

**Interfaces:**
- Consumes: `getRenderingBudget`.
- Owns: Each component's animation frames, intervals, timeouts, listeners, canvas backing stores, and audio element.

- [ ] **Step 1: Apply rendering budgets to the starfield**

Use `getRenderingBudget` to cap star count and frame rate. In the reduced profile, draw no animated stars and do not schedule an animation frame. Store bound `resize`, `visibilitychange`, and `pagehide` handlers. Add an idempotent `destroy()` that cancels the frame, removes listeners, clears stars, resets the canvas to `1x1`, and prevents restart.

- [ ] **Step 2: Bound the hero reveal and acceptance effects**

Scale handwriting particle creation by `handwritingParticleScale`; when it is zero, reveal the text immediately without creating a canvas animation. Track reveal animation frames and timeouts in sets, clear them on `pagehide`, and reset canvas backing stores after completion.

Use `confettiParticles` for the acceptance burst and skip the call when it is zero. Retain the background `Audio` object and fade interval in module scope, guard against a second start, and pause/release audio on `pagehide`.

- [ ] **Step 3: Bound the countdown interval**

Keep the interval identifier, clear it after the event time passes, and clear it on `pagehide`. Ensure repeated initialization cannot create multiple intervals.

- [ ] **Step 4: Run diagnostics and focused tests**

Run sequentially:

```powershell
npm.cmd run test:unit
npm.cmd run astro -- check
npm.cmd run build
```

Expected: all tests pass, Astro reports zero errors, and the static build completes.

- [ ] **Step 5: Commit bounded effect lifecycles**

```powershell
git add src/components/StarfieldCanvas.astro src/components/HeroSection.astro src/components/CountdownTimer.astro
git commit -m "perf: bound animation and media lifecycles"
```

### Task 5: Preloader, Lightbox, Scrolling, and Mobile Compositing

**Files:**
- Modify: `src/components/MagicPreloader.astro`
- Modify: `src/components/StoryGallery.astro`
- Modify: `src/components/MobileNavBar.astro`
- Modify: `src/components/RevealedContent.astro`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `data-rendering-profile` on `<html>`.
- Owns: Critical-image listeners, lightbox HD source, and scroll animation scheduling.

- [ ] **Step 1: Restrict and clean up the preloader**

Select only `img[loading="eager"]` for preload waiting. Store every listener callback so it can be removed when the preloader hides. Clear the progress interval and fallback timeout exactly once through an idempotent finish routine. Do not retain a pending `Promise.all` for lazy gallery images.

- [ ] **Step 2: Release lightbox image memory**

Before assigning a lightbox image, clear the previous `onload`. On close, wait for the existing close transition, then remove `src`, `srcset`, and `onload` if the modal is still closed. Clear any pending release timeout before reopening or navigating.

- [ ] **Step 3: Throttle scroll-driven class updates**

In `MobileNavBar.astro` and `RevealedContent.astro`, register scroll listeners with `{ passive: true }`. Use one `requestAnimationFrame` gate per listener so repeated scroll events cannot trigger repeated layout reads in the same frame. Cancel pending frames and remove listeners on `pagehide`.

- [ ] **Step 4: Add narrow-screen and reduced-motion compositing rules**

In `global.css`, target `html[data-rendering-profile="mobile"]` and `html[data-rendering-profile="reduced"]`. Disable backdrop blur on repeated `.glass-card` elements, simplify their box shadows, and hide `.ambient-orb` layers. Under the reduced profile, disable nonessential CSS animation and transitions while preserving the splash acceptance control and content visibility.

- [ ] **Step 5: Run full local verification**

Run sequentially:

```powershell
npm.cmd run test:unit
npm.cmd run test:build
npm.cmd run astro -- check
```

Start the mandated background server:

```powershell
npx.cmd astro dev --background
```

Verify `/`, `/helmar-returan/`, and `/lara-espanola/` return `200` with expected content. Verify `/404.html` contains the root redirect. Check server logs, then stop it with `npx.cmd astro dev stop`.

Do not run the deploy script.

- [ ] **Step 6: Commit the completed stability pass**

```powershell
git add src/components/MagicPreloader.astro src/components/StoryGallery.astro src/components/MobileNavBar.astro src/components/RevealedContent.astro src/styles/global.css
git commit -m "perf: reduce mobile rendering pressure"
```
