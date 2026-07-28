# CHANGELOG — projects/argus-3d/index.html

## 2026-07-27 — Checker (5×) verification pass
Two defects found and fixed during the five-pass rigorous review (headless WebGL render +
screenshot verification). No geometry/logic beyond the two targeted fixes.

- **Favicon 404 removed.** Added a branded `data:image/svg+xml` "CF" favicon `<link>` in `<head>`.
  The console previously logged a single `favicon.ico` 404 (the only console error); now clean.
  Uses a data URI, so it also works under `file://`.

- **Honest hypervelocity impact readout no longer clobbered.** `triggerImpact()` sets the phase
  readout to the honest line ("… hypervelocity energy deposition … useful deflection/effect
  uncertain (impact campaign P6)"), but the `stepFire()` coast branch overwrote `#phase` with the
  "coast …" text on every subsequent frame, so the impact line was never visible during the hold.
  Guarded the coast textContent write with `if(!impacted)`; the honest readout now persists through
  the impact/aftermath for every dart family. (`phase` variable still set for the cine camera.)

Verified after fixes: node --check passes; file ends `</script></body></html>`; full launch
accel→coast→impact→ready with zero console/page errors; break-up matrix intact (30m all disrupt;
100m R/Q/V deflect, M/T break; 300m all deflect); all clickable ids resolve; works under file://.
