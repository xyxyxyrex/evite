# Moonlit Letter Landing Design

## Goal

Redesign the invitation landing screen as a concise moonlit letter set within a layered portrait scene. The new screen should feel brighter, more dimensional, and more magical on mobile while remaining elegant on desktop and conservative with browser memory and GPU work.

This design replaces the current dense two-card splash composition. It does not change the revealed invitation content, Google Sheets tracking, RSVP behavior, background music, guest routing, or Cloudflare deployment model.

## Visible Copy

The landing screen will show only the following content, plus the existing acceptance button:

- `Hi,` followed by the resolved guest name or `Honored Guest`.
- `You are invited to:`.
- `Isabel, Once Upon Eighteen`.
- `Accept Invitation & Open`.

The greeting label, invitation label, and `Once Upon Eighteen` use the existing serif family. The guest name and `Isabel,` use the existing cursive family. The hierarchy must make `Isabel` the event identity while keeping the guest greeting personal.

The landing screen will remove the crest, botanical header, full debutante name, birthday-description lines, repeated invitation announcement, photo caption badge, and other visible explanatory text. Decorative gold rules and small star symbols may remain because they are not content.

## Composition

The splash becomes one full-bleed scene rather than two glass cards.

### Mobile

The moonlit letter occupies the upper portion of the first viewport. The portrait scene rises beneath it and overlaps the letter slightly, creating one continuous composition. The acceptance button stays within the first viewport at an iPhone 13 size of `390x844`, including safe-area insets.

The supplied `src/assets/parallax/background.png` fills the portrait-stage background. `src/assets/parallax/foreground.png` sits above a dedicated sparkle layer, using the matching `1024x1536` coordinate space so Isabel remains aligned with the garden.

### Desktop

The same assets form a cinematic side-by-side composition. The portrait stage occupies the left side and the moonlit letter occupies the right, with a controlled overlap rather than separate floating cards. The scene remains vertically centered and does not require scrolling before acceptance.

### Letter Material

The letter uses translucent midnight-blue vellum with a restrained paper grain, fine gold hairline borders, pearl-gold typography, and softly illuminated edges. It must be brighter and more legible than the current all-navy card without becoming an ivory or beige page.

The letter is one semantic content surface. Decorative borders use pseudo-elements or unframed layers; the implementation must not nest decorative cards.

## Layered Portrait Effect

The portrait stage contains exactly these visual depth layers:

1. Blurred garden background image.
2. Bounded sparkle canvas.
3. Transparent portrait foreground image.
4. Noninteractive edge shading needed for text and scene integration.

The images use Astro's asset pipeline and share a stable aspect ratio. They must use identical `object-position`, sizing, and transform origins so movement does not expose mismatched edges.

Pointer movement on desktop and direct touch movement on mobile may shift the layers within these maximum ranges:

- Background: `4px`.
- Sparkles: `8px`.
- Foreground portrait: `12px`.

One passive pointer listener records the desired position. A single request-animation-frame gate applies transforms, avoiding layout reads during movement. There is no device-orientation permission request and no continuous parallax loop when input is idle.

Reduced-motion mode keeps every layer static.

## Sparkles

Sparkles sit behind Isabel and above the garden so the portrait silhouette occludes them naturally. They should read as small distant points of warm gold light, with occasional restrained four-point glints rather than a dense particle field.

A dedicated Canvas 2D layer is preferred over adding a general particle library. The scene needs only a few bounded points, and a larger engine would add bundle and runtime overhead without improving this specific effect.

Hard limits:

| Property | Desktop | Mobile | Reduced Motion |
| --- | ---: | ---: | ---: |
| Active sparkles | 12 | 6 | 0 |
| Target frame rate | 30 fps | 20 fps | No loop |
| Canvas DPR | Maximum 1.5 | 1 | No backing store |

Positions are created once when the stage is sized. Sparkles update opacity and scale with time-based math and remain in a fixed array. No object is allocated per frame. The canvas pauses while the document is hidden, resumes without creating another loop, and resets to a `1x1` backing store on teardown.

## Greeting Reveal

The newly implemented fixed-layout guest-name reveal remains, including its feathered mask, bounded pen-tip glint, font-readiness gate, mobile caps, and lifecycle cleanup. Its visual styling will be integrated into the letter typography without restoring the clipped drop-shadow or width-driven animation.

The greeting runs once. Reduced-motion visitors see the completed name immediately.

## Enchanted Unsealing Transition

The acceptance transition replaces the current blur-and-upward shift and the confetti burst.

On activation:

1. The button becomes disabled so the sequence cannot run twice.
2. One gold highlight travels around the letter border.
3. A compact glint appears at the button center.
4. The letter rises slightly and dissolves into a small, bounded set of gold motes.
5. The portrait foreground advances subtly toward its resting foreground position.
6. A soft gold veil passes across the viewport and reveals the existing main invitation beneath it.

The complete sequence lasts about `900ms`. It uses opacity and transforms rather than animating layout, backdrop blur, or large filter radii. The main invitation becomes available before the splash is hidden, and the splash is removed from display after the transition finishes.

The transition may reuse the existing `canvas-confetti` dependency only if configured as a small, gravity-free gold mote burst within the profile cap. It must not retain the existing large confetti explosion. A CSS/canvas implementation is preferred if it avoids competing animation systems.

Mobile uses fewer motes and a simpler veil. Reduced-motion mode uses a short crossfade with no border trace, motes, parallax advance, or canvas animation.

The existing acceptance tracking request and audio start remain initiated by the same user gesture.

## Responsive Behavior

At `390x844`, the letter and enough of Isabel's portrait must be visible together, the acceptance button must not be clipped, and no text may overlap the portrait's face. The layout must respect top and bottom safe-area insets.

At desktop sizes, the portrait and letter share the first viewport without oversized empty regions. The brand signal is Isabel's portrait and event title, both visible immediately.

Text size uses fixed responsive breakpoints or container-aware constraints, not viewport-width font scaling. Long guest names may wrap within the letter while preserving readable line height and without resizing adjacent controls.

## Performance and Lifecycle

The scene will extend the existing `full`, `mobile`, and `reduced` rendering budgets rather than create independent heuristics.

The scene controller owns its canvas, animation frame, transition timeout, pointer listener, resize observer or listener, visibility listener, and particle arrays. Cleanup is idempotent. A normal page exit removes listeners and releases resources. A BFCache page hide pauses transient work and restoration must not duplicate listeners or restart a completed transition.

Only transform and opacity are promoted during active motion. `will-change` is removed or avoided after transitions. Mobile CSS does not add backdrop filters to repeated or full-screen layers.

Image decoding uses the optimized output produced by Astro. The portrait foreground preserves transparency. The old `LandingPage.jpg` is no longer loaded by the splash after the new scene is integrated.

## Testing and Verification

Test-first implementation will cover:

- Exact desktop, mobile, and reduced sparkle budgets.
- Static output containing the background, sparkle, foreground, letter, and veil layers.
- Static output containing the required concise copy.
- Static output no longer containing the removed landing copy.
- Existing guest routing and build fallback behavior.

Pure parallax and transition calculations will be extracted only where they provide real deterministic behavior to test. Source-text change-detector tests and browser mocks will not be added.

Final verification will run the complete unit suite, Astro diagnostics, and production-output build tests. Local browser verification will inspect desktop `1280x800`, iPhone 13 `390x844`, reduced motion, long guest names, the completed transition, hidden-document pause behavior where tooling permits, and canvas release after dismissal.

No remote push or Cloudflare deployment will occur.

## Success Criteria

- The landing screen reads as one moonlit letter and portrait scene, not two stacked cards.
- Only the approved concise invitation copy and acceptance button are visible.
- The supplied garden and transparent portrait assets align at mobile and desktop sizes.
- Sparkles appear behind Isabel, never over her face or body.
- Parallax responds smoothly to input and is idle when input is idle.
- The acceptance sequence feels like an enchanted unsealing rather than a blur-and-slide dismissal.
- The mobile layout fits the iPhone 13 first viewport without clipped controls or incoherent overlap.
- Desktop retains an intentional, balanced first viewport.
- All particle, canvas, frame, timeout, and event resources remain bounded and cleanly released.
- Reduced-motion visitors receive an immediate, usable, static experience.
