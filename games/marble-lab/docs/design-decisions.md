# Design decisions and scope

Owner: U. Warring. Current specification: Task Card “Relief” v0.1, 25 September 2026, draft and unendorsed. This file summarizes decisions from the conversation; implementation details, coefficients and sources are in `dist/model-notes.html` and `dist/material-parameters.json`.

## Product and controls

- A mobile browser game, initially one maze and two test phones; no dedicated app.
- Tilt controls acceleration. Momentum and counter-tilt braking remain fundamental. Difficulty must emerge from materials and geometry, not a tilt-to-velocity control law.
- Pitched-neutral beta/gamma calibration; hardware axes remapped to screen orientation. Touch and keyboard remain usable tilt controls.
- Enable tilt is a separate user action. Audio/permission/fullscreen initialization follows browser activation requirements.
- Full motion applies measured translation; tilt-only remains one tap away. No shake, toss, jump or stuck detector.
- Material choices expose meaningful physical scenarios. Most coefficients remain estimates, not calibrated specimens.

## Relief specification

- Terrain is a heightfield. Local gradient and curvature feed the equations of motion; visual exaggeration never alters physics.
- Comfortable tilt starts at 8°, terrain stays below 15°, and levels combine free, committed and momentum-only slopes.
- Broad irregular features, smooth first derivatives, routes through three to five passes, drainage-based holes, and a gentle summit held for three seconds.
- Walls have low (2r) and tall (6r) heights. Top edges are rims, not platforms. Optional outer-edge falls are retained.
- Traps arise from confinement or loss thresholds. A pocket, sandy pothole and resin patch replace nonphysical latches or jamming states.
- Precomputed fixed-light relief shading, contours, material patches, physically driven spin and flight shadows communicate state without terrain labels.
- Generator acceptance uses a bounded tilt bot; impossible candidates must be rejected. No second playable level before two-phone acceptance.

## Explicit implementation interpretations

1. A carried ball starts separation with zero velocity relative to the board; relative launch speed develops during the stop. Finite-duration acceleration is integrated instead of injecting velocity.
2. Linear acceleration and gravity use the same calibrated frame. Otherwise pitched calibration creates false support in free fall.
3. Accelerometer full-scale range is not exposed by the browser. Logs contain measured peaks and suspected clipping; no guessed device-dependent acceleration boost is applied.
4. Broad basins are drained; the confinement pocket and sandy pothole are intentionally undrained exceptions.
5. The pocket regression checks 30 seconds of constant exit-directed tilt, then one reference pulse. It does not prove confinement against all possible resonant pumping sequences.
6. Route acceptance covers all five balls on wood. Whole-board floor swaps are exploratory and may be impassable at the default budget.
7. Full motion is translational inertia plus virtual tilt. Euler, Coriolis, centrifugal and sensor lever-arm terms are omitted; this is not a complete rotating six-DOF board model.
8. The accelerationIncludingGravity sign is measured during calibration, not inferred from the user agent. The spec and Android report +g face up; WebKit (every iPhone browser) reports −g on all three axes. A reading that matches neither sign within 0.1g turns full motion off; tilt-only still works.
9. No full 3D steep contact, grain-level sand, new selectable Relief materials, or gesture library. Oil film remains deferred.

## Evidence

- `dist/relief-generation.json`: selected candidate and blocked-level rejection.
- `dist/relief-validation.json`: geometry, drainage, pocket, all route trials and pending phone entries.
- `tests/`: reproducible regression tests; legacy material routes are non-playable fixtures.
- `docs/acceptance.md`: remaining gates. Only U. Warring can endorse the task card to v1.0.
