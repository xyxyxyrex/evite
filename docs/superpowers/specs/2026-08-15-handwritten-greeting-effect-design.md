# Handwritten Greeting Effect Design

## Goal

Refine the personalized handwritten name on the invitation landing screen so its reveal feels graceful and continuous, its golden glow has no rectangular clipping, and its sparkle reads as a restrained pen-tip glint. The effect must remain safe for mobile Safari and respect the rendering profiles already used by the site.

This is a focused visual refinement. It does not redesign the landing-page layout, typography, invitation content, acceptance interaction, music, or RSVP behavior.

## Current Problem

The name is revealed by changing the text element's width on every animation frame while that same element has `overflow: hidden`, a feather mask, blur, and two strong drop shadows. The width boundary clips the filtered pixels into a visible rectangle. Because width changes also affect layout, the browser must repeatedly perform layout and paint work during the reveal.

Sparkles are spawned with frame-based random probabilities. Their density therefore varies with device frame rate, and the independent random positions, sizes, and lifetimes make the motion feel noisy rather than choreographed.

## Visual Direction

The reveal will resemble an elegant illuminated pen stroke:

- The name appears from left to right over about 1.5 seconds.
- Motion starts gently, travels steadily through the middle, and settles softly on the final letter.
- A small four-point gold-white glint leads the visible edge.
- No more than four tiny motes trail the glint at once.
- The motes drift only a few pixels, fade quickly, and never compete with the lettering.
- A soft elliptical gold halo follows the glint and fades fully to transparent on every side.
- At completion, the moving halo and particles disappear while the finished name keeps a restrained text glow.

The existing navy and gold visual identity and cursive font remain unchanged.

## Rendering Architecture

### Stable Text Layout

The name element will occupy its final measured width for the entire animation. JavaScript will not animate `width`. A CSS custom property will carry normalized reveal progress from `0` to `1`, and a mask will use that value to expose the text with a feathered leading edge.

Keeping the element at its final size prevents the exclamation mark and surrounding greeting from shifting and avoids a layout calculation on every frame.

### Independent Glow

The large reveal-time drop shadow will be removed from the masked text. A separate absolutely positioned glow element will follow the writing edge. It will use a compact radial gradient with transparent outer stops, sufficient padding, and no overflow clipping.

The completed name may retain a subtle static drop shadow. That shadow is applied only after the reveal mask has been removed, so it cannot form a hard rectangular edge.

### Pen Glint and Motes

The existing canvas will render one leading diamond glint and a bounded pool of trailing motes. Emission will be based on elapsed time and traveled distance rather than frame probability, producing the same cadence at different refresh rates.

The glint will pulse gently without spinning rapidly. Motes will reuse fixed pool entries and use time-based position and opacity updates. The canvas will remain an overlay with a small padded area around the name and will be released to a `1x1` backing store after completion.

## Motion Model

One `requestAnimationFrame` loop owns the reveal, glow position, glint, and motes. Progress is calculated from elapsed time so dropped frames do not lengthen or destabilize the sequence.

The reveal curve will use a smooth ease-in-out function. The feather width and halo intensity will remain visually consistent through the middle of the animation, then taper during the final portion. When progress reaches `1`, no new motes are emitted; the loop runs only until the small active pool has faded.

The effect will start after the existing short greeting delay. It will not loop or replay automatically.

## Performance Budgets

The effect will consume the existing `full`, `mobile`, and `reduced` rendering profiles.

| Property | Full | Mobile | Reduced |
| --- | ---: | ---: | ---: |
| Canvas DPR | Maximum 1.5 | 1 | No canvas |
| Active motes | Maximum 4 | Maximum 2 | 0 |
| Leading glint | 1 | 1 | 0 |
| Reveal animation | About 1.5 seconds | About 1.5 seconds | Immediate |

The particle array will have a hard cap. No particles will be created after the reveal completes. The implementation will not add a second animation loop, full-screen canvas, blur filter on the canvas, or continuously animated background effect.

## Lifecycle and Fallbacks

Animation-frame and timeout identifiers remain owned by the hero controller. On a normal page exit, it will cancel scheduled work, clear the particle pool, hide the glow, and reset the canvas backing store. On a back-forward cache transition, it will complete the name immediately and release transient visual resources so restoration cannot resume a half-finished effect.

If the canvas context or text measurement is unavailable, the name becomes visible immediately. Visitors using `prefers-reduced-motion: reduce` receive the completed name with no moving glow, glint, or particles.

## Testing

The motion calculations will be separated into small pure utilities where practical. Tests will define the performance contract before implementation, including:

- Full, mobile, and reduced sparkle limits.
- Progress clamping and eased reveal endpoints.
- Time-based mote emission that never exceeds the profile cap.
- Static production output containing the glow and canvas layers without the old width-driven reveal contract.

Final verification will run the focused unit tests, `astro check`, and the production build. The background Astro server will be used to inspect the generic and personalized invitation routes at desktop and iPhone-sized viewports where local tooling permits. No Cloudflare deployment or remote push will occur.

## Success Criteria

- The golden glow has no straight or rectangular visible boundary.
- The text reveal does not change element width on every frame.
- The writing motion has a smooth start, steady middle, and gentle finish.
- One leading glint and a few short-lived motes provide restrained sparkle.
- Particle behavior is deterministic across refresh rates and strictly bounded.
- Mobile uses DPR 1 and no more than two motes.
- Reduced-motion visitors see the completed name immediately.
- All transient canvas, timer, frame, and particle resources are released.
- The rest of the invitation remains visually and behaviorally unchanged.
