# Mobile Gyro Activation Design

## Goal

Make the layered portrait on the index experience respond reliably to phone tilt in iOS Chrome and Android Chrome. Preserve desktop pointer parallax, the current background/rear-magic/foreground/front-magic layer order, and reduced-motion behavior.

## Root Cause

The existing orientation math is covered by unit tests and produces bounded values, but sensor activation is not covered. The browser lifecycle currently depends on a generic `pointerup` listener on the portrait, silently swallows permission failures, and exposes no requesting, active, denied, or unavailable state. On the reported iOS Chrome path, the required permission prompt never appears. Android also has no visible recovery path when automatic event attachment produces no sensor readings.

The repair will move activation to a semantic button whose `click` handler directly performs the permission request or listener attachment. The controller will not claim success until it receives a valid orientation event.

## Interaction Design

- Show a compact circular glass icon in the portrait's top-right corner on touch-capable mobile devices.
- Give the button an accessible name of `Enable motion effect` and a visible focus treatment.
- On first load, briefly reveal a small `Enable motion` hint next to the icon, then collapse it to the icon jewel.
- Keep the control visible while permission is being requested or while waiting for the first valid sensor event.
- After the first valid reading, show a brief gold active glow/check state and fade the control away.
- If permission is denied or no valid reading arrives, keep the control available and show a short, unobtrusive status hint. The invitation remains fully usable without motion.
- Do not render or activate the control when `prefers-reduced-motion: reduce` is enabled.

## Architecture

Extract the browser-independent motion lifecycle into small utilities in `src/utils/landingScene.ts`. The utilities will model supported activation states and screen-aware orientation mapping without accessing the DOM. `HeroSection.astro` will own DOM listeners, the permission call, timeout lifecycle, button rendering, status updates, and application of CSS transforms.

The controller states are:

1. `idle`: motion can be requested.
2. `requesting`: a permission request or first-reading probe is in progress.
3. `active`: at least one valid sensor reading has been received.
4. `denied`: the browser explicitly refused permission.
5. `unavailable`: the API is absent, the page is not a secure context, or no valid reading arrives during the probe window.

Only `active` orientation data can take ownership from pointer input. Failed activation leaves the scene centered on touch devices and preserves pointer behavior wherever a fine pointer is available.

## Activation Flow

1. During scene initialization, determine whether reduced motion is enabled and whether device orientation is potentially available.
2. If eligible, reveal the motion button. Do not depend solely on `(pointer: coarse)` to decide whether the sensor API may be used.
3. On the button's direct `click` event, enter `requesting`.
4. If `DeviceOrientationEvent.requestPermission` exists, call it synchronously from that click stack and handle `granted` or `denied` explicitly.
5. If the permission method does not exist, attach the orientation listener from the same click action.
6. Wait for the first event with finite `beta` and `gamma` values. Use it as the neutral baseline, enter `active`, and begin scene updates.
7. If no valid event arrives within a short probe window, enter `unavailable`, detach the listener, and show recovery guidance.
8. Recalibrate the baseline when screen orientation changes or when the page returns from being hidden, preventing a large jump.
9. Remove the button, orientation, screen-orientation, visibility, timeout, and animation-frame listeners during scene teardown.

## Layer Motion

Convert orientation readings into viewport-relative x/y deltas before normalization so portrait and landscape modes behave consistently. Clamp and smooth the result, then apply the existing depth scale:

- background image: 4 px maximum per axis
- rear and front particle/magic canvases: 8 px maximum per axis
- foreground image: 12 px maximum per axis

All four rendered elements continue to use one scheduled input animation frame. The two magic canvases move together as the single particle depth layer. Existing overscan remains sufficient for the bounded offsets.

## Error Handling And Recovery

- `denied`: display `Motion access was not allowed` and leave the button available so the state is not silent. A repeat tap may explain that browser site permissions must be changed if the browser does not re-prompt.
- `unavailable`: display `Motion is unavailable on this device` without affecting the invitation flow.
- insecure context: treat as unavailable because orientation events are restricted to secure contexts.
- null or non-finite readings: ignore them while probing; they never activate gyro control.
- visibility changes: detach or pause sensor processing while hidden, clear the baseline, and resume only when visible.

## Testing

Use test-driven development for the production changes.

- Unit-test screen-orientation-aware axis mapping in portrait and both landscape directions.
- Unit-test finite-value validation and clamping.
- Unit-test lifecycle transitions for granted, denied, first valid reading, and probe timeout through pure helpers where practical.
- Extend the build-output test to require the semantic motion button, accessible label, and emitted activation hooks.
- Run the complete unit suite, Astro type/content checks, production build-output tests, and `git diff --check`.
- Manually verify on iOS Chrome and Android Chrome over HTTPS: the button appears, iOS prompts from the tap, Android activates after a valid reading, all three visual depths move distinctly, denial is non-blocking, and reduced motion suppresses the control.

## Scope

Modify only the landing-scene utilities, the hero component, and their focused tests. Do not change image assets, invitation copy, invitation-opening behavior, RSVP flow, desktop pointer behavior, or deployment configuration. Do not add dependencies or deploy the site.
