# Portrait Magic Layer Design

## Goal

Add a clearly visible magical depth layer around Isabel while preserving the existing portrait composition and performance limits.

## Layer Order

1. Transparent foreground portrait of Isabel
2. Canvas-based gold light trail, sparkles, and fine magic dust
3. Garden background image

The effect follows the open space around Isabel's hair, shoulders, and dress so it reads as light moving behind the subject rather than decoration over her face or body.

## Motion

- Draw one slow, looping gold trail with a soft glow and a short fading tail.
- Reuse a small fixed pool of dust motes and occasional diamond sparkles.
- Keep motion gentle and continuous, with no rapid flashes.
- Allow the existing parallax system to move the magic layer between the background and foreground depths.

## Performance And Accessibility

- Use the existing single scene canvas and fixed device-specific budgets.
- Reuse allocated particle objects; do not create objects during animation frames.
- Cap frame rate and device pixel ratio using the existing scene profile.
- Stop rendering while the page is hidden and dispose of the canvas during transition teardown.
- Under reduced motion, render a quiet static trail without animated particles.

## Scope

Only the portrait's middle visual layer changes. The letter, copy, foreground/background assets, invitation transition, RSVP flow, and Cloudflare deployment remain unchanged.
