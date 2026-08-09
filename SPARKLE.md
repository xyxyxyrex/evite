# Sparkling Text Reveal — Animation Options (Astro)

Reference notes for implementing a magical/enchanted "sparkling reveal" of the guest's name on the evite landing page (`example.com/[guestName]`).

## Context

- Stack: Astro
- Guest name is dynamic per route (e.g. `/johnDoe`, `/janeDoe`)
- Goal: letter/word reveal animation that feels enchanted/magical, likely a one-time entrance effect on page load

---

## Option 1: GSAP + SplitText (best overall control)

The most reliable choice for a letter-by-letter magical entrance with full control over timing, easing, and stagger.

**Install:**
```bash
npm install gsap
```

**Usage:**
```js
import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText"; // free as of GSAP 3.13+

gsap.registerPlugin(SplitText);

const split = new SplitText("#guestName", { type: "chars" });
gsap.from(split.chars, {
  opacity: 0,
  y: 20,
  scale: 0.5,
  filter: "blur(4px)",
  stagger: 0.05,
  duration: 0.8,
  ease: "back.out(1.7)",
});
```

**Notes:**
- Astro ships zero JS by default — trigger this via a `<script>` tag on the page, or inside a React/Svelte/Vue island if using an Astro UI integration.
- ~30kb gzipped, tree-shakes well.

---

## Option 2: tsparticles (sparkle particles)

Use for actual twinkling sparkle/glitter particles around or behind the text. Pairs well with GSAP.

**Install:**
```bash
npm install @tsparticles/engine @tsparticles/slim
```

**Notes:**
- Configure a `particles` preset like `"stars"`, or a custom sparkle shape (small circles with pulsing opacity).
- Position the particle canvas absolutely behind the name text.

---

## Option 3: canvas-confetti (burst moment)

Not a true "sparkle" effect, but great for a magical *reveal burst* — e.g. a shimmer/confetti pop the moment the name fades in.

**Install:**
```bash
npm install canvas-confetti
```

**Notes:**
- Very small footprint, no framework dependency needed.

---

## Option 4: CSS-only shimmer (no JS library)

Lightest option. Animated gradient sweep across the text using `background-clip: text` for an ambient magical shimmer.

```css
.guest-name {
  background: linear-gradient(90deg, #d4af37 0%, #fff8dc 50%, #d4af37 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: shimmer 2.5s linear infinite;
}

@keyframes shimmer {
  to { background-position: -200% center; }
}
```

---

## Recommendation

Since this is a one-time reveal per page load (not a looping effect):

1. **GSAP SplitText** — letter-by-letter magical entrance
2. **CSS shimmer** — ambient effect after the reveal completes
3. **tsparticles** (optional) — a few sparkles positioned around the text for extra polish

This combo delivers the "enchanted" feel without bloating the bundle.

---

## Next Steps

- [ ] Build `[guestName].astro` dynamic route
- [ ] Wire up GSAP SplitText reveal on mount
- [ ] Add CSS shimmer to `.guest-name` post-reveal
- [ ] (Optional) Layer tsparticles sparkle effect