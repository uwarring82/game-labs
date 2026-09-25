# Marble Lab — material model 05

One top-down maze with phone tilt, touch steering and keyboard controls. Static HTML/CSS/JavaScript; no runtime dependencies, analytics, or sensor uploads. The Site remains private.

## Player controls

Enable tilt → allow access → hold a comfortable angle → Calibrate → Play. Touch is available immediately. A touch-pad displacement sets virtual tilt (a cubic radial response gives fine centre control), not velocity. Arrow keys / WASD supply 16° virtual tilt. Phone tilt is relative beta/gamma, independent of alpha, with screen-axis remapping and recalibration after a screen rotation. Tilt magnitude is limited to 28°; gravity magnitude stays 9.81 m/s². Hiding or blurring the page pauses until Resume.

Materials replaces Classic/Forgiving presets, damping, sensitivity and filter sliders. Choose steel, bouncy rubber, hollow table tennis, cork or billiard resin; wood, sand, ice or baize; and independent hardwood walls or passive rubber bumpers. Changing materials resets the run. Steel/rubber/cork have 15 mm diameter, table tennis 40 mm and billiards 57.15 mm. Maze geometry scales with radius; board dimensions appear in Materials. Hole rims stay hardwood. All 40 combinations are available. The input filter is fixed at 15 ms.

## Physics

Source: `dist/physics.js`. Fixed profiles: `dist/materials.js`. Parameter ledger, equations, references, limitations and an experimental calibration plan: `dist/model-notes.html` (linked from Diagnostics).

The ball has position, velocity, angular velocity, mass, isotropic inertia and a visual quaternion. Coulomb contact impulses determine rolling/sliding; normal and tangential restitution determine impact response. Rolling loss is a contact moment, with separate torsional resistance. Sand adds estimated load- and density-dependent penetration, a plough force, a rolling moment and inertial drag. Quadratic air drag applies to all balls with fixed rho=1.225 kg/m³ and Cd=.47. Shell inertia is 2/3 mR². No global damping and no speed clamp remain. Internal steps are at most 1/960 s and restrict displacement to R/5. The public fixed clock remains 240 Hz and clamps long frame gaps to 50 ms.

Sphere–box contacts include finite wall height; forward roll at a wall can produce a hop. Hole capture now comes from free fall and geometric rim / cylindrical-wall contact. It supersedes the v1 chord-time / 4 mm catch-depth heuristic. Capture occurs when the centre is more than one radius below the aperture. Clearing the outer frame ends a run.

### Evidence status

This is a physically structured, literature-informed prototype, **not an experimentally calibrated digital twin**. Most numerical contact coefficients are estimates; billiard/baize uses pooltool reference defaults muK=.2 and horizontal rolling deceleration=.01g, while billiard/rubber borrows e=.98 and impact friction=.14 from Mathavan et al. These do not calibrate the maze or reproduce regulation cushion geometry; no exact steel-on-wood or rubber-on-wood measurements were available for the specified specimens. Density and geometry have explicit SI values. The granular penetration scaling is taken from a glass-bead experiment, while transfer to sand, finite-depth clipping and resistance prefactors are provisional extrapolations. Sand depth is 5 mm; its deformation state enters resistance, not a dynamically depressed support surface. Individual grains and evolving terrain are absent; the new static heightfield is separate from granular deformation. The restitution interpolation is not a fitted constitutive law for wood/sand.

Calibration requires measured ball mass/diameter, named wood/finish/backing, and defined sand grain distribution, packing, moisture and depth. Fit coast-down, sliding, normal rebound and oblique spin-impact observations; check predictions on held-out tracks. See model-notes.html for details and primary sources.

## Diagnostics

Raw/filtered tilt, browser timing and simulated contact regime, slip, spin, height, terrain height, normal load, goal dwell, kinetic energy and estimated sinkage. CSV includes material identity and simulated state for each record, up to 12,000 records. All data remain local unless downloaded. Browser event age is not physical motion-to-pixel latency. Event rate may be change-driven; rotation-rate fields do not prove that a device has a particular gyroscope or sensor-fusion algorithm.

## Verification

`npm test` runs 79 checks, including full routes for all 40 combinations and shell inertia, ice slip threshold, air drag decay, billiard reference deceleration, independent walls, plus ideal 5/7 rolling acceleration for both masses, analytic sliding-to-rolling velocity, passive impacts with spin, material rebound, coast-down and sand ordering, high-speed contacts, geometric holes, energy bounds, valid maze routes, calibration/remapping, time-step independence and pauses. Syntax and local HTML/JS references are checked separately.

No physical-phone, browser visual, or supported-context WebMCP verification was available in this build environment. The existing optional WebMCP read/control interface remains feature-detected.

## Permission and phone checks

Enable tilt requests motion/orientation permission directly from its tap. Denial leaves touch available. Open the HTTPS page directly in Safari / Chrome. A containing frame must delegate accelerometer / gyroscope (potentially magnetometer for an absolute-orientation fallback), with permission from its parent policy. The child cannot grant this to itself. Safari may require clearing the site data after denial.

Test iPhone Safari and Android Chrome (including a low-cost device without a gyro if available): pitched neutral near 35°, chair yaw, screen rotations, a quick tilt step, slow/fast hole approaches, coast/counter-tilt braking, wall hops, changing app and resuming, page-scroll suppression. Test representative combinations of all five balls, four floors and two walls; sand intentionally needs larger tilts. Compare with physical specimens before describing the parameters as calibrated.

## Material documentation

`node scripts/write-model-notes.mjs` regenerates the complete 20 floor / 10 wall contact-pair tables and `dist/material-parameters.json` from the active profiles. Re-run when profiles change. Source selection and limitations appear next to each interpretation. The optional oil film is deferred until viscosity, thickness and flow/contact assumptions are defined.

## Scenery

The canvas uses distinct functional floor textures for wood, sand, ice and baize, corresponding surrounding colours, separate rubber bumper surfaces and material-specific ball finishes. Spin markers follow the simulated quaternion. Texture marks exert no force. Screen coordinates are normalised; all recorded positions, velocities and sizes remain physical SI quantities.

## Screen, rendering and feedback (model 04)

- Maze authoring uses 9 × 19 board units in `dist/maze.js`. The base physical board is now 30 × 63.3 cm and scales with ball radius. `dist/viewport.js` uniformly fits the canvas inside safe areas, listens to VisualViewport resize/scroll, and caps backing density at 2. No geometry is stretched to the viewport.
- `dist/manifest.webmanifest` plus PNG home-screen icons request standalone portrait launch. iPhone help recommends Safari Share → Add to Home Screen and Open as Web App on iOS 26. No service worker/offline cache is added; private authentication may require another sign-in.
- Android Enable tilt calls audio resume, available sensor permission requests and fullscreen from the same event before awaiting; fullscreen success is followed by a portrait-lock request. Each capability can fail independently. Nonessential HUD chips hide while playing. Pause remains visible, and touch retains its pad.
- `dist/render.js` caches the base surfaces, holes, walls and shadows on a detached canvas. A separate marks canvas accumulates sand grooves and ice skids, preserving marks across viewport resizes and automatic retries; explicit restart/material changes clear it. Marks exert no forces. Terrain uses exaggerated fixed-light relief shading and isoheight contours. A small level indicates tilt without moving the shading. A single fixed light, ball quaternion marks/seam, height-dependent shadow/scale and an opaque dark rim expose state and aid contrast.
- `dist/sound.js` generates continuous surface-dependent filtered noise from rolling speed or ice slip. Thresholded physics contact notifications supply impact impulses to material-specific synthesised hits; rim and landing events are included. Capture gets a descending tone. Audio scheduling uses the context clock, a 55 ms impact interval, six impact voices and slight detuning. These are designed timbres, not experimentally calibrated acoustics.
- Sound defaults on; it initializes only in user control gestures. Ambient session mode is requested when exposed; no silent-mode workaround. Pause stops voices and rolling; visibility loss additionally suspends audio. Optional wall vibration is limited to one 8–20 ms pulse per 100 ms and disabled when unsupported.

The extra tests verify uniform viewport fit/DPR, contact event non-interference, render execution and cache/marks lifecycle using an instrumented 2D context, Web Audio timing/lifecycle with test doubles, and base-palette contrast cues across all 20 ball/floor pairs. They do not substitute for actual pixels, listening tests or permission checks on phones. Browser preview is unavailable for this static Site in this environment.

## Terrain and optional edge drops (model 05)

`dist/terrain.js` authors four compact C² caps, then precomputes C¹ bicubic Hermite cells. Contact height, normal and curvature differentiate the same potential. Obstacles preserve slope under board scaling; the goal keeps a fixed 3 m curvature radius. The finite sphere-centre offset enters directional curvature, giving crest radius Rc+r and dip radius Rc-r. The unilateral contact solver supplies reaction/friction; its normal-load estimate only changes resistance, avoiding double application of curvature forces. Rolling/torsional loss and sand ploughing act in the local tangent. Sand uses a provisional instantaneous effective-density factor N/(mg), not a calibrated dynamic bed.

The whole ball must remain grounded inside the goal ring at speed <0.08 m/s for three simulated seconds. A progress arc displays dwell. Material-dependent settling is preserved. The lossless instability reference is about 0.66 s for a solid steel sphere; friction gives a central deadband.

Materials & play now has an optional Open edges checkbox, off by default. It removes only outer walls, ends the floor at the board rectangle, and reuses edge/rim contact, the fall cue and 800 ms restart. Both normal and open borders are covered on all four sides; the 40-combination route suite uses the default bordered mode.

Terrain checks cover analytic inclined motion for solid and hollow balls, gradient/Hessian consistency, C¹ cell joins, authored slope limits, flat apertures, curved normal load including finite radius, mechanical-energy bounds and climb thresholds, dip oscillation period, crest launch/landing, total-slope ice slip, load-dependent sand, goal curvature across ball sizes and uninterrupted dwell. The route controller includes static-gradient feed-forward and is test-only. Browser pixels, phone performance, audible feedback and physical material calibration remain unverified.
