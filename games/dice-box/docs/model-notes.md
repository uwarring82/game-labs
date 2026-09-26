# Dice Box — model notes v0.2

26 September 2026 · realistic dice, a loaded die, breakable glass · owner: U. · sibling of Marble Lab (same input pipeline, new engine). v0.1, the first prototype, is development stage 1 (commit `bfceb7f`).

## 1. What is simulated

Up to five sharp-edged cubes (edge s = 16 mm, mass 4.5 g) in a box 66 × 140 × 36 mm: felt floor, glass walls and lid. Everything is computed in the box frame, which is the phone. The walls never move; the world does. One die can be loaded, and the glass can shatter.

## 2. Input — the phone is the box

An accelerometer measures specific force f = a − g. In the box frame the effective gravity on a free body is therefore G = −f exactly, with no fusion, no gravity separation and no gesture detection: tilt, lift, drop and shake are all one vector. Rotation of the box adds the frame terms: for a die whose centre of mass is at r with velocity v (sensor assumed at the box centre)

a_fict = −α × r − ω × (ω × r) − 2 ω × v,   dω_rel/dt = −α − ω × ω_rel (+ the precession term of §3 for a loaded die)

with ω from rotationRate and α by smoothed finite difference. The last relation is what makes an airborne die keep its absolute orientation while the box twists.

Browsers disagree on the sign of accelerationIncludingGravity (spec: +9.81 on z when flat; every iPhone browser reports it reversed, because WebKit passes Core Motion's sign through). The sign is measured at start from 40 samples by correlating f with the orientation-derived up vector u = (−sin γ cos β, sin β, cos β cos γ); no platform table is used. |G| is capped at 60 m/s² for the physics; the glass (§5) sees the uncapped value. Without sensors (desktop, permission declined) a pointer drag becomes box acceleration at true scale, Space is a toss, and a synthetic shake with translation and rotation is available.

## 3. Rigid-body engine

- Uniform cube: inertia isotropic, I = m s²/6, so there is no gyroscopic term and rotation integrates as q̇ = ½ ω q at fixed dt = 1/480 s (8 substeps per 60 Hz frame).
- Contacts: die–wall from the 8 vertices against 6 planes (full manifold, stable resting); die–die by the separating-axis test over 15 axes, incident-face clipping for face contacts (up to 4 deepest points) and closest-points for edge–edge, with a 0.2 mm preference for face axes.
- Speculative contacts: a pair is admitted when its gap is smaller than one step of relative travel plus 0.2 mm; the solver then lets bodies close the gap but not cross it, so no tunnelling at the speeds a hand produces (velocity cap 4 m/s, spin cap 250 rad/s).
- Solver: sequential impulses, 10 iterations, accumulated and clamped; Coulomb friction on two tangents; Baumgarte push-out β = 0.2 with 0.05 mm slop, capped at 0.4 m/s; restitution only above 0.15 m/s approach speed (below that, inelastic, which is what lets dice settle).
- Sleep: |v| < 15 mm/s and |ω| < 0.8 rad/s for 0.25 s. A sleeping die is static for the solver and wakes on an impulse above 3 × 10⁻⁴ N s (a knock, not resting load), on a change of G above 0.6 m/s² (about 3.5° of tilt or any shake), or when a touching die wakes.
- Materials (estimates, as in Marble Lab): felt e = 0.25, μ = 0.5; glass e = 0.55, μ = 0.18; die–die e = 0.5, μ = 0.3.
- Reading: the face whose outward normal is most aligned with −G. Below cos 20° a die is reported as cocked, as a casino would.

### Loaded die

A loaded die looks and weighs the same (4.5 g) but carries a thin dense square plate (side 0.75 s = 12 mm) 1.5 mm beneath one face, at distance d = s/2 − 1.5 mm = 6.5 mm from the centre. With plate mass m_p = φ m and body mass m_b = m − m_p (uniform), the centre of mass moves towards that face by c = φ d, and the principal moments about the new centre of mass are

I_axial = m_b s²/6 + m_p p²/6,   I_transverse = m_b s²/6 + m_b c² + m_p [(d − c)² + p²/12]

(p = plate side). φ = 0 gives the uniform cube. The heavy face tends to end down, so the opposite face is favoured. The slider sets φ from 0 to 0.8; at 0.8 the plate is 3.6 g (for tungsten, about 12 × 12 × 1.3 mm in a hollowed body) and c = 5.2 mm. That is an extreme but buildable die.

- Dynamics: the die's position is its centre of mass. Contact geometry (vertices, separating axes, clipping) uses the geometric centre; contact lever arms use the centre of mass. Impulses and the effective mass use the world-frame inverse tensor A diag(1/I) Aᵀ.
- Rotation in the box frame gains the torque-free precession term I⁻¹(L × Ω), with Ω = ω + ω_rel and L = IΩ, from Euler's equations in the rotating frame (the remaining terms are those of the uniform cube). That term conserves rotational energy, and each explicit step is rescaled to keep it exactly.
- Checks: zero load reproduces the uniform cube bit for bit, and the 14 original checks print identical output. A fully loaded die rests flat. In free rotation (half load, 0.25 s), energy follows the spin damping to 10⁻⁵, L keeps its direction to 0.02°, and the load axis stays within 0.06° of the analytic torque-free top; a uniform cube would be 17° away. The check fails if the precession term is removed.
- Neglected: torques from the non-uniform frame forces across the die (centrifugal and Euler terms act at the centre of mass only), and the plate's thickness.

### Shattered box

When the glass breaks (§5), the lid and walls leave the contact set and the felt becomes a finite pad: a contact exists only where the vertex lies above the pad. Dice that slide or are thrown off it fall along G; 15 cm below the felt a die is gone (asleep, never woken, not read). "New box" restores the glass and puts the dice back. Checked: level, the dice stay on the pad; tilted 30° (felt μ = 0.5 < tan 30°), all five slide off.

## 4. Fairness

Fairness is structural, then measured.

Structural: exact cube, centre of mass at the centre, isotropic inertia, identical contact law on all faces, no randomness in the engine (the only random numbers in the page are in the synthetic shake and the test seed; a real throw is deterministic given the phone's motion). Sharp edges are the correct choice: casino precision dice are razor-edged for exactly this reason, and rendering rounds the edges by 1.1 mm without touching the geometry the contacts see.

Measured, headless, 480 Hz, seeded:
- Single die from a fixed 1-up start, 300 throws, shake 40 m/s²/1.2 s: 54 51 52 63 42 37 (χ²(5) ≈ 8; consistent with flat). Same from a 6-up start: 46 44 63 52 51 43.
- Five dice from uniformly random orientations, 80 throws (400 faces): 66 55 62 76 66 66, χ² = 3.6. The die–die contact code introduces no bias.
- Five dice from an aligned 1-up start with a *gentle* shake (40 m/s², 1.2 s, 7 rad/s): 221 83 91 79 84 35, χ² = 202. This is memory, not bias: a raft of flush cubes slides as a block and is not turned; the single die under the same shake was fair. With a vigorous shake (50 m/s², 2 s, 16 rad/s) the same start gives 71 73 59 67 59 64, χ² = 2.7.
- Loaded die, favouring 6, among four fair dice, vigorous shake from the aligned start, 400 throws each (seed 11):

| Slider | Plate φ | c | Faces 1–6 of the loaded die | Share of 6 | χ²(5) | Fair dice χ²(5) |
| --- | --- | --- | --- | --- | --- | --- |
| 25 % | 0.2 | 1.3 mm | 53 68 63 52 72 88 | 22.2 % | 13.6 | 2.1 |
| 50 % | 0.4 | 2.6 mm | 38 70 49 70 51 114 | 29.1 % | 55.6 | 6.7 |
| 75 % | 0.6 | 3.9 mm | 33 61 49 47 61 142 | 36.1 % | 115.5 | 5.6 |
| 100 % | 0.8 | 5.2 mm | 19 49 47 55 60 154 | 40.1 % | 167.8 | 6.9 |

  Even this heavy load does not make the die predictable: it shifts the odds, as real loaded dice do. The 1 (the plate's face) is depleted most. A check with the load under the 5 gave the 2 at 43 % (200 throws).

The in-page test uses the vigorous shake from the aligned start, which is the harder test, and includes the loaded die from Setup. It reports counts per die, a pooled χ² for the fair dice, and the loaded die's share and χ² separately. It also states the rule the numbers taught: a gentle wobble is not a throw, on glass or on a table.

## 5. Glass

The box shatters when the magnitude of the measured specific force |f| (the accelerometer reading, gravity included; 1 g at rest) stays above a limit for 25 ms. The limit is set in Setup from 2 g to 12.5 g, or unbreakable; the default is 8 g, above the 6.6 g peak of the on-screen Shake, so that button never breaks the default glass. Setup shows the strongest |f| seen so far, to help choose a limit.

This is a game rule, not a fracture model. Real glass fails from stress, which here would come mostly from dice striking the panes and from the panes' own inertial load; the rule uses the quantity the phone measures. At the moment of breaking, the box-frame gravity is by definition above the limit, so dice and shards leave the view within about 0.1–0.5 s. That is what the phone would see.

Shards are visual only: each pane (lid and four walls) splits into jittered triangles, about 18 mm across, 160 in total. They get a random break velocity (0.25–1.15 m/s outward plus up to 0.25 m/s sideways) and spin (8–38 rad/s), fall along G like the dice, and fade after 2.5 s. They do not collide with dice, felt or each other. Sound: a decaying high-passed crash with 28 scattered tinkles; Android vibrates 40–30–90 ms.

## 6. Rendering

three.js r128 (UMD build, vendored in `vendor/`; identical to the official release).

- Dice: rounded-cube geometry whose grid lines sample the 1.1 mm edge arcs evenly in angle (12 segments per quarter circle, 6 from each face), so edges are round, not chamfered. Pips (Western layout, 1–2–3 counter-clockwise, opposite faces sum to 7) are drilled spherical dimples of 1.44 mm radius and 0.45 mm depth, with a 0.12 mm rounded rim. They are generated once into a 2048 × 1024 atlas shared by all dice: a tangent-space normal map, used by both the plastic and its clear coat, and a surface map holding paint coverage, roughness (body 0.2, paint 0.55) and cavity darkening. A shader hook mixes each die's body and pip colours by the paint coverage, so one texture set serves all five colours.
- Colours, one per die and the same in the readout and the fairness table: ivory (black pips), red, blue, amber (black pips), black (white pips). Polished acetate: clear coat 0.8, coat roughness 0.05.
- Glass: transmission instead of partial opacity. Each pixel is only as opaque as its reflection, about 4 % straight on and strong at grazing angles, and the glass has no diffuse colour. The earlier version drew two 13 %-opaque light shells over everything, which washed out the dice and the felt. Two shells still give the edges thickness; a window reflection lies across the lid.
- Light: one directional lamp with soft shadows that stays on the room's ceiling by following the orientation estimate. The studio environment's light panel sits in the lamp's default direction, about 30° from vertical, so top faces seen from above do not mirror it.
- Felt with a noise texture and bump.
- Colour pipeline: three.js r128 treats material hex colours as linear, so every material colour is converted with convertSRGBToLinear and textures are tagged sRGB; a headless render on 26 September showed the plinth grey and the red die salmon before this was fixed.

## 7. Sound and haptics

Impacts drive synthesized clicks from the solver's normal impulse: felt thud (650 Hz band, 70 ms), glass click (3.3 kHz + 6 kHz tick, 30 ms), die–die clack (2.5 kHz + 4 kHz). Level from impulse, ±12 % detune, one voice per 9 ms. Android vibrates 8 ms on hard hits; iOS has no haptics API. Breaking glass: see §5.

## 8. Known limits and next checks

- Sensor at the box centre is an assumption; the true offset adds α × d terms of a few m/s² during snaps. Unknowable without calibration; accepted.
- 60 Hz motion events under-sample a snap; the engine holds each sample over 8 substeps. If tosses feel unrepeatable on a phone, lengthen the flick rather than filter.
- Accelerometer range (±2 g on older phones, commonly ±8 or ±16 g now) clips hard shakes. A glass limit above the phone's range can never trigger; the strongest-so-far readout shows what the phone delivers.
- The start-up sign detection uses the first 40 samples whether or not the phone is still. Marble Lab now checks the sign during a hold-still window and rejects readings that match neither sign; Dice Box should adopt that.
- Contact coefficients are estimates; a dropped-die video against a ruler would calibrate e for felt and glass in an afternoon.
- Not modelled: air drag (negligible at 16 mm), edge rounding in contacts, elastic vibration of the glass, fracture mechanics (§5), shard collisions.
- Two-phone test outstanding, as for Marble Lab: sign detection, sample rate, whether the sleep thresholds hide the last small settle, and the peak |f| a hard shake reaches on each phone.
- Fixed in v0.2: a frame could start before the tap that began a synthetic shake, giving the shake a negative time and a script error for that frame.

---

**Endorsement marker.** Model notes v0.2 — draft, unendorsed. Endorse after the two-phone test and one in-page fairness run of 200 throws with p > 0.01 for fair dice. Endorser: U. Warring.
