# Postmortem: Mobile search bar unresponsive on iOS Safari

**Status:** RESOLVED · **Date:** 2026-08-10 · **Fixed in:** `06e6603`

## Symptom

On iPhone (real iOS Safari), tapping the homepage search bar did nothing — no keyboard, no focus, no cursor. The input rendered correctly and worked fine on desktop and Android Chrome. Incognito testing ruled out cache.

## What was tried first (and why it failed)

Initial fix `c011c28` targeted the hypothesis "an invisible layer sits on top of the input and eats the tap":

- `pointer-events-none` on the hero's grid overlay
- removed `backdrop-blur-xl` from the input itself
- also shipped the viewport export + `html { overflow-x: hidden }` (those two **did** fix the unrelated pinch-to-zoom bug)

The tap bug persisted. Root-cause investigation showed the hypothesis was wrong:

- `elementFromPoint()` at the input's center returns the **input** — nothing is painted above it (verified with all animations running)
- a real synthesized click produced `pointerdown → mousedown → focus` in Chromium
- no global touch handlers, no `user-select`/`touch-action`/`will-change` traps, no re-render loops, no nav overlap

## Root cause

**WebKit-specific compositing bug, not an overlay or logic bug.** iOS Safari keeps GPU-composited layers for infinitely-animating ancestors, and that layer churn swallows taps on child inputs. The homepage search input is the only input in the app that sits *inside* the animated hero (15s `gradient-shift` + floating `blur-3xl` blobs + shine sweep). Every working input in the app (login, `/new`, `/become-seller`) lives in a plain section below the decorative hero — the perfect split confirmed the cause.

## Fix

`app/globals.css` — pause the three continuous decorative animations on touch devices; desktop keeps the full animated hero:

```css
@media (hover: none) and (pointer: coarse) {
  .animated-gradient,
  .blob,
  .shine-button {
    animation: none;
  }
}
```

Static appearance is identical on touch; only the motion stops, removing the compositor churn that was eating taps.

## Verification

- Live DOM check: media query present in served CSS; desktop emulation still runs `gradient-shift` (infinite)
- `tsc` clean · eslint 0 errors · `npm run build` 13/13 routes
- **Real-device test on iPhone (incognito): PASS** — keyboard opens, typing filters live

## Lessons

1. **Emulators give false confidence for WebKit compositing bugs.** Chrome DevTools and headless browsers are Chromium pretending to be Safari — the bug (and the fix) only reproduce on real iOS. Ship, then test on the physical device.
2. **Pattern-matching beats isolated inspection.** The "every working input is outside the animated hero, the one broken input is inside it" split was the decisive evidence.
3. **Held in reserve:** Fix 5 — removing `backdrop-blur-xl` from the fixed nav — was prepared as a fallback if this fix hadn't landed. Not needed; keep in mind if touch regressions reappear.
