# Portrait Magic Layer Design

## Goal

Add a clearly visible magical depth layer around Isabel while preserving the existing portrait composition and performance limits.

## Layer Order

1. Front arc canvas for the near half of the orbit and its reflected glow
2. Transparent foreground portrait of Isabel
3. Rear arc canvas for the far half of the orbit, sparkles, and fine magic dust
4. Garden background image

The two canvases render one synchronized continuous orbit. Its rear section disappears behind Isabel, fades through two crossover points, emerges across her dress and arm, then returns behind her. A cached soft glow sprite uses screen blending near the front orb to suggest warm light falling on her skin and dress.

## Motion

- Draw one slow, looping gold trail with a soft glow and a short fading tail.
- Interpolate continuously between precomputed path samples instead of snapping between indices.
- Render the orbit at native `requestAnimationFrame`, targeting 60 FPS on desktop and mobile.
- Reuse a small fixed pool of dust motes and occasional diamond sparkles.
- Keep motion gentle and continuous, with no rapid flashes.
- Allow the existing parallax system to move the magic layer between the background and foreground depths.

## Performance And Accessibility

- Use synchronized rear/front canvases and fixed device-specific budgets.
- Reuse allocated particle objects; do not create objects during animation frames.
- Keep mobile canvas DPR at `1` and desktop DPR capped at `1.5`.
- Pre-render glow artwork once and reuse it with `drawImage` during frames.
- Stop rendering while the page is hidden and dispose of the canvas during transition teardown.
- Under reduced motion, render quiet static front/rear arcs without animated particles or parallax.

## Gyroscope Parallax

- Use `deviceorientation` on supported mobile browsers and retain pointer parallax on desktop.
- On iOS, request `DeviceOrientationEvent` permission only from the user's first tap on the portrait.
- Apply low-pass smoothing and clamp orientation input before passing it through the existing `4px / 8px / 12px` depth offsets.
- Schedule gyro updates through the existing single input animation frame and remove all listeners during scene teardown.

## Scope

Only the portrait's middle visual layer changes. The letter, copy, foreground/background assets, invitation transition, RSVP flow, and Cloudflare deployment remain unchanged.
