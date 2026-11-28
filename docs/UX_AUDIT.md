# UX audit (Task 5)

Screens checked in the running app (Testing mode, PT): Mark Pain, Visit (typed lines, auto-follow, movement offer), Summary (coverage review, corrections, reports), Past Visits, Pre-Visit Brief. Light and dark, at laptop (1440 × 900) and phone (390 × 844) widths. Reviewed with the `apple-design` skill.

## Fixed in this pass

| # | Severity | Problem | Fix |
|---|---|---|---|
| 1 | Critical | Phone and tablet: the fixed three-column grid (`320px · body · 360px`) squeezed the 3D body to nothing and cut off the right panel. | Below `lg`, one panel at a time with a bottom tab bar: Body / Mark Pain (Marks) / Prep (Visit, Summary, Brief). The body stays loaded underneath. `src/panels/PhoneTabs.jsx`. |
| 2 | High | Phone header: the steps pushed the main action (Start Visit / End Visit / Back to Marking) off screen. | Steps hidden on phones (the tab bar names the step), smaller padding and title, user name hidden below `sm`, header scrolls sideways as a last resort. |
| 3 | High | The "Drag to turn" hint wrapped into a narrow column on tablets and phones. | Hidden below `lg`; also hidden during the visit (Auto-Follow uses that space). |
| 4 | High | Laptop Summary header overflowed (Log Out clipped) once Past Visits was added. | Past Visits is icon-only below `2xl`, with its label for screen readers. |
| 5 | High | A visit stopped when the mic or the server failed. | Typed input for prep and visit (#34), works with the server off. |
| 6 | Medium | "Accept Patient's Version" was cut off in a two-column row in the 360px panel. | Stacked buttons. |
| 7 | Medium | Patient color as a filled background with white text (typed-line speaker switch) would fail contrast. | Selected speaker is colored text on a plain background. |

## Checked and fine

- Dark mode: the new cards (coverage review, corrections, side chips, brief, past visits) use the theme tokens; amber stays for missed pain only.
- Keyboard: every new control is a real button or form field; Past Visits and the Brief take focus when they open and close with Esc.
- Screen readers: toggles use `aria-pressed`, the side chips are labelled groups ("Which shoulder?"), status chips use `aria-live`.
- Reduce Motion: auto-follow uses the existing camera moves, which become instant cuts.
- Nothing new relies on color alone: every status has an icon shape or words.

## Open (team decision or after the demo)

1. **Use My Photo**: hidden today because it isn't reliable. Recommendation: remove it from the demo build; PTs won't miss it.
2. **Phone header**: Log Out and the theme control sit at the end of a sideways-scrolling header on very small phones. A compact account menu would fix it.
3. **First-run hints**: short, dismissible tips for first-time patients ("Tap where it hurts") and PTs ("Talk normally; the body follows").
4. **Anatomy loading**: the 3.9 MB anatomy file shows a plain wait the first time; a progress hint would help on slow networks.
5. **Camera code**: `BodyScene.jsx` is large; moving the camera functions into their own module is a safe refactor after the demo.
