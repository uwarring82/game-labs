# Dice Box — model notes v0.1

25–26 September 2026 · first prototype · owner: U. · sibling of Marble Lab (same input pipeline, new engine)

## 1. What is simulated

Up to five sharp-edged, uniform cubes (edge s = 16 mm, mass 4.5 g) in a box 66 × 140 × 36 mm: felt floor, glass walls and lid. Everything is computed in the box frame, which is the phone. The walls never move; the world does.

## 2. Input — the phone is the box

An accelerometer measures specific force f = a − g. In the box frame the effective gravity on a free body is therefore G = −f exactly, with no fusion, no gravity separation and no gesture detection: tilt, lift, drop and shake are all one vector. Rotation of the box adds the frame terms: for a die at r with velocity v (sensor assumed at the box centre)

a_fict = −α × r − ω × (ω × r) − 2 ω × v,   dω_rel/dt = −α − ω × ω_rel

with ω from rotationRate and α by smoothed finite difference. The last relation is what makes an airborne die keep its absolute orientation while the box twists.

Browsers disagree on the sign of accelerationIncludingGravity (spec: +9.81 on z when flat; Safari historically inverted). The sign is measured at start from 40 samples by correlating f with the orientation-derived up vector u = (−sin γ cos β, sin β, cos β cos γ); no platform table is used. |G| is capped at 60 m/s². Without sensors (desktop, permission declined) a pointer drag becomes box acceleration at true scale, Space is a toss, and a synthetic shake with translation and rotation is available.

## 3. Rigid-body engine

- Uniform cube: inertia isotropic, I = m s²/6, so there is no gyroscopic term and rotation integrates as q̇ = ½ ω q at fixed dt = 1/480 s (8 substeps per 60 Hz frame).
- Contacts: die–wall from the 8 vertices against 6 planes (full manifold, stable resting); die–die by the separating-axis test over 15 axes, incident-face clipping for face contacts (up to 4 deepest points) and closest-points for edge–edge, with a 0.2 mm preference for face axes.
- Speculative contacts: a pair is admitted when its gap is smaller than one step of relative travel plus 0.2 mm; the solver then lets bodies close the gap but not cross it, so no tunnelling at the speeds a hand produces (velocity cap 4 m/s, spin cap 250 rad/s).
- Solver: sequential impulses, 10 iterations, accumulated and clamped; Coulomb friction on two tangents; Baumgarte push-out β = 0.2 with 0.05 mm slop, capped at 0.4 m/s; restitution only above 0.15 m/s approach speed (below that, inelastic, which is what lets dice settle).
- Sleep: |v| < 15 mm/s and |ω| < 0.8 rad/s for 0.25 s. A sleeping die is static for the solver and wakes on an impulse above 3 × 10⁻⁴ N s (a knock, not resting load), on a change of G above 0.6 m/s² (about 3.5° of tilt or any shake), or when a touching die wakes.
- Materials (estimates, as in Marble Lab): felt e = 0.25, μ = 0.5; glass e = 0.55, μ = 0.18; die–die e = 0.5, μ = 0.3.
- Reading: the face whose outward normal is most aligned with −G. Below cos 20° a die is reported as cocked, as a casino would.

## 4. Fairness

Fairness is structural, then measured.

Structural: exact cube, centre of mass at the centre, isotropic inertia, identical contact law on all faces, no randomness in the engine (the only random numbers in the page are in the synthetic shake and the test seed; a real throw is deterministic given the phone's motion). Sharp edges are the correct choice: casino precision dice are razor-edged for exactly this reason, and rendering rounds the edges by 1 mm without touching the geometry the contacts see.

Measured, headless, 480 Hz, seeded:
- Single die from a fixed 1-up start, 300 throws, shake 40 m/s²/1.2 s: 54 51 52 63 42 37 (χ²(5) ≈ 8; consistent with flat). Same from a 6-up start: 46 44 63 52 51 43.
- Five dice from uniformly random orientations, 80 throws (400 faces): 66 55 62 76 66 66, χ² = 3.6. The die–die contact code introduces no bias.
- Five dice from an aligned 1-up start with a *gentle* shake (40 m/s², 1.2 s, 7 rad/s): 221 83 91 79 84 35, χ² = 202. This is memory, not bias: a raft of flush cubes slides as a block and is not turned; the single die under the same shake was fair. With a vigorous shake (50 m/s², 2 s, 16 rad/s) the same start gives 71 73 59 67 59 64, χ² = 2.7.

The in-page test therefore uses the vigorous shake from the aligned start, which is the harder test. It also states the rule the numbers taught: a gentle wobble is not a throw, on glass or on a table.

## 5. Rendering

three.js r128 (UMD from cdnjs). Rounded-cube geometry built by projecting a subdivided box onto the inner box plus a 1.1 mm shell; pips are recessed-looking discs, Western layout (1–2–3 counter-clockwise, opposite faces sum to 7). Ivory acetate with clearcoat, one red die when five are in play; felt with noise texture and bump; two glass shells for edge thickness and a window reflection across the lid; a procedural studio environment for reflections; one directional lamp with soft shadows that stays on the room's ceiling by following the orientation estimate.

## 6. Sound and haptics

Impacts drive synthesized clicks from the solver's normal impulse: felt thud (650 Hz band, 70 ms), glass click (3.3 kHz + 6 kHz tick, 30 ms), die–die clack (2.5 kHz + 4 kHz). Level from impulse, ±12 % detune, one voice per 9 ms. Android vibrates 8 ms on hard hits; iOS has no haptics API.

## 7. Known limits and next checks

- Sensor at the box centre is an assumption; the true offset adds α × d terms of a few m/s² during snaps. Unknowable without calibration; accepted.
- 60 Hz motion events under-sample a snap; the engine holds each sample over 8 substeps. If tosses feel unrepeatable on a phone, lengthen the flick rather than filter.
- Accelerometer range (±2 g on older phones) clips hard shakes; a clipping indicator belongs in the debug overlay next.
- Contact coefficients are estimates; a dropped-die video against a ruler would calibrate e for felt and glass in an afternoon.
- Not modelled: air drag (negligible at 16 mm), edge rounding in contacts, elastic vibration of the glass.
- Two-phone test outstanding, as for Marble Lab: sign detection, sample rate, whether the sleep thresholds hide the last small settle.
- Colour pipeline: three.js r128 treats material hex colours as linear, so every material colour is converted with convertSRGBToLinear and textures are tagged sRGB; a headless render on 26 September showed the plinth grey and the red die salmon before this was fixed.

---

**Endorsement marker.** Model notes v0.1 — draft, unendorsed. Endorse after the two-phone test and one in-page fairness run of 200 throws with p > 0.01. Endorser: U. Warring.
